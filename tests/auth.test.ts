import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LoginRateLimiter,
  SESSION_COOKIE,
  clearSessionCookie,
  createSessionToken,
  parseCookies,
  serializeSessionCookie,
  verifyAccessKey,
  verifySessionToken,
} from '../src/server/auth.js'

test('校验访问密钥使用恒定时间比较语义', () => {
  assert.equal(verifyAccessKey('correct-key', 'correct-key'), true)
  assert.equal(verifyAccessKey('correct-kez', 'correct-key'), false)
  assert.equal(verifyAccessKey('', 'correct-key'), false)
})

test('会话签名可往返，并能识别篡改与错误密钥', () => {
  const secret = 'x'.repeat(40)
  const { token, payload } = createSessionToken(secret, 60)
  assert.equal(verifySessionToken(token, secret)?.exp, payload.exp)
  assert.equal(verifySessionToken(`${token}tampered`, secret), null)
  assert.equal(verifySessionToken(token, 'y'.repeat(40)), null)

  const [body, signature] = token.split('.')
  assert.ok(body && signature)

  const tamperedBody = `${body.slice(0, -1)}${body.endsWith('A') ? 'B' : 'A'}`
  assert.equal(verifySessionToken(`${tamperedBody}.${signature}`, secret), null)

  const tamperedSignature = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`
  assert.equal(verifySessionToken(`${body}.${tamperedSignature}`, secret), null)
})

test('过期会话被拒绝', () => {
  const secret = 'x'.repeat(40)
  const now = 1_700_000_000_000
  const { token } = createSessionToken(secret, 60, now)
  assert.equal(verifySessionToken(token, secret, now + 59_000)?.exp, now + 60_000)
  assert.equal(verifySessionToken(token, secret, now + 61_000), null)
})

test('Cookie 解析与会话 Cookie 序列化', () => {
  assert.deepEqual(parseCookies('a=1; b=2=3'), { a: '1', b: '2=3' })
  assert.deepEqual(parseCookies(undefined), {})
  assert.equal(SESSION_COOKIE, 'ddc_session')

  const cookie = serializeSessionCookie('tok', { maxAge: 100, secure: true })
  assert.match(cookie, /^ddc_session=tok; Path=\/; HttpOnly; SameSite=Lax; Max-Age=100; Secure$/)
  assert.match(clearSessionCookie({ secure: false }), /Max-Age=0/)
})

test('登录限流按窗口阻断，成功后重置', () => {
  const limiter = new LoginRateLimiter(1000, 2)
  const now = 1_700_000_000_000

  assert.equal(limiter.check('ip', now).allowed, true)
  limiter.recordFailure('ip', now)
  limiter.recordFailure('ip', now + 100)

  const blocked = limiter.check('ip', now + 200)
  assert.equal(blocked.allowed, false)
  assert.ok((blocked.retryAfterSec ?? 0) > 0)

  assert.equal(limiter.check('ip', now + 1200).allowed, true)
  limiter.recordFailure('ip', now + 1200)
  limiter.recordSuccess('ip')
  assert.equal(limiter.check('ip', now + 1300).allowed, true)
})
