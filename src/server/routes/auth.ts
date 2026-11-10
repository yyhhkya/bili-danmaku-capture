import { Router } from 'express'

import type { AppConfig } from '../config.js'
import {
  LoginRateLimiter,
  SESSION_COOKIE,
  clearSessionCookie,
  createSessionToken,
  parseCookies,
  serializeSessionCookie,
  verifyAccessKey,
  verifySessionToken,
} from '../auth.js'
import type { Logger } from '../logger.js'
import type { AuthMeResponse, LoginResponse } from '../../shared/types.js'

export function createAuthRouter(
  config: AppConfig,
  limiter: LoginRateLimiter,
  logger: Logger,
): Router {
  const router = Router()
  const ttlSeconds = config.sessionDays * 24 * 60 * 60

  router.post('/login', (req, res) => {
    const ip = req.ip ?? 'unknown'
    const limit = limiter.check(ip)
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec ?? 60))
      res.status(429).json({
        error: { code: 'TOO_MANY_ATTEMPTS', message: '尝试次数过多，请稍后再试' },
      })
      return
    }

    const key = typeof req.body?.key === 'string' ? req.body.key : ''
    if (!key || key.length > 512) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: '请输入访问密钥' } })
      return
    }

    if (!verifyAccessKey(key, config.accessKey)) {
      limiter.recordFailure(ip)
      logger.warn('登录失败', { ip })
      res.status(401).json({ error: { code: 'INVALID_KEY', message: '密钥错误' } })
      return
    }

    limiter.recordSuccess(ip)
    const { token, payload } = createSessionToken(config.sessionSecret, ttlSeconds)
    res.setHeader(
      'Set-Cookie',
      serializeSessionCookie(token, { maxAge: ttlSeconds, secure: config.cookieSecure }),
    )
    logger.info('登录成功', { ip })
    const body: LoginResponse = { authenticated: true, expiresAt: payload.exp }
    res.json(body)
  })

  router.post('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie({ secure: config.cookieSecure }))
    res.json({ authenticated: false } satisfies AuthMeResponse)
  })

  router.get('/me', (req, res) => {
    const cookies = parseCookies(req.headers.cookie)
    const session = verifySessionToken(cookies[SESSION_COOKIE], config.sessionSecret)
    if (!session) {
      res.json({ authenticated: false } satisfies AuthMeResponse)
      return
    }
    res.json({ authenticated: true, expiresAt: session.exp } satisfies AuthMeResponse)
  })

  return router
}
