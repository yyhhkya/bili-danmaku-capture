import { Router } from 'express'

import type { BiliAccount } from '../bili/account.js'
import { BiliApiError } from '../bili/http.js'
import { QrLoginService, QrRateLimitError } from '../bili/qr-login.js'

function sendBiliError(
  res: import('express').Response,
  error: unknown,
  fallback: string,
): void {
  if (error instanceof QrRateLimitError) {
    res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: error.message } })
    return
  }
  if (error instanceof BiliApiError) {
    res.status(502).json({ error: { code: `BILI_${error.code}`, message: error.message } })
    return
  }
  const message = error instanceof Error ? error.message : fallback
  res.status(502).json({ error: { code: 'BILI_REQUEST_FAILED', message } })
}

export function createBiliRouter(account: BiliAccount, qr: QrLoginService): Router {
  const router = Router()

  router.get('/status', (_req, res) => {
    res.json(account.status())
  })

  router.post('/qr', async (req, res) => {
    try {
      res.json(await qr.start(req.ip ?? 'unknown'))
    } catch (error) {
      sendBiliError(res, error, '二维码申请失败')
    }
  })

  router.get('/qr/:handle', async (req, res) => {
    try {
      res.json(await qr.poll(req.params.handle))
    } catch (error) {
      sendBiliError(res, error, '扫码状态查询失败')
    }
  })

  router.post('/logout', async (_req, res) => {
    res.json(await account.logout())
  })

  return router
}
