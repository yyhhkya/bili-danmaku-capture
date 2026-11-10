import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'

export const SESSION_COOKIE = 'ddc_session'

export interface SessionPayload {
  v: 1
  iat: number
  exp: number
  nonce: string
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/** 两边先做定长哈希，再恒定时间比较，避免长度侧信道。 */
export function verifyAccessKey(input: string, expected: string): boolean {
  const a = sha256(input)
  const b = sha256(expected)
  return timingSafeEqual(a, b)
}

export function createSessionToken(
  secret: string,
  ttlSeconds: number,
  now = Date.now(),
): { token: string; payload: SessionPayload } {
  const payload: SessionPayload = {
    v: 1,
    iat: now,
    exp: now + ttlSeconds * 1000,
    nonce: randomBytes(12).toString('base64url'),
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return { token: `${body}.${signature}`, payload }
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): SessionPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts
  if (!body || !signature) return null

  const expected = createHmac('sha256', secret).update(body).digest()
  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (payload.v !== 1 || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      return null
    }
    if (payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  if (!header) return result
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (name) result[name] = value
  }
  return result
}

export function serializeSessionCookie(
  token: string,
  opts: { maxAge: number; secure: boolean },
): string {
  const pieces = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(opts.maxAge)}`,
  ]
  if (opts.secure) pieces.push('Secure')
  return pieces.join('; ')
}

export function clearSessionCookie(opts: { secure: boolean }): string {
  const pieces = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (opts.secure) pieces.push('Secure')
  return pieces.join('; ')
}

export class LoginRateLimiter {
  private readonly failures = new Map<string, number[]>()

  constructor(
    private readonly windowMs = 15 * 60 * 1000,
    private readonly maxFailures = 5,
  ) {}

  private prune(ip: string, now: number): number[] {
    const recent = (this.failures.get(ip) ?? []).filter((time) => now - time < this.windowMs)
    if (recent.length === 0) this.failures.delete(ip)
    else this.failures.set(ip, recent)
    return recent
  }

  check(ip: string, now = Date.now()): { allowed: boolean; retryAfterSec?: number } {
    const recent = this.prune(ip, now)
    if (recent.length < this.maxFailures) return { allowed: true }
    const oldest = recent[0] ?? now
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
    }
  }

  recordFailure(ip: string, now = Date.now()): void {
    const recent = this.prune(ip, now)
    recent.push(now)
    this.failures.set(ip, recent)
  }

  recordSuccess(ip: string): void {
    this.failures.delete(ip)
  }
}

export function requireAuth(secret: string): RequestHandler {
  return (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie)
    const session = verifySessionToken(cookies[SESSION_COOKIE], secret)
    if (!session) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } })
      return
    }
    res.locals.session = session
    next()
  }
}
