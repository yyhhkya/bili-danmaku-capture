import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { Logger } from '../logger.js'
import type { BiliStatus } from '../../shared/types.js'

interface StoredSession {
  v: 1
  cookie: Record<string, string>
  refreshToken: string
  uid: number | null
  uname: string | null
  face: string | null
  updatedAt: number | null
  needsReauth: boolean
}

type Source = 'qr' | 'env' | 'none'

const FILE_NAME = 'bili-session.json'

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`bili-session:${secret}`, 'utf8').digest()
}

function encryptJson(payload: StoredSession, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  })
}

function decryptJson(raw: string, secret: string): StoredSession {
  const envelope = JSON.parse(raw) as { v: number; iv: string; tag: string; data: string }
  if (envelope.v !== 1) throw new Error('不支持的会话文件版本')
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(secret),
    Buffer.from(envelope.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  const plain = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ])
  return JSON.parse(plain.toString('utf8')) as StoredSession
}

export class BiliSessionStore {
  private readonly jar = new Map<string, string>()
  private refreshToken = ''
  private uid: number | null = null
  private uname: string | null = null
  private face: string | null = null
  private updatedAt: number | null = null
  private needsReauth = false
  private source: Source = 'none'

  constructor(
    private readonly dataDir: string,
    private readonly secret: string,
    private readonly envCookie: string,
    private readonly logger: Logger,
  ) {}

  private get filePath(): string {
    return path.join(this.dataDir, FILE_NAME)
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8')
      const stored = decryptJson(raw, this.secret)
      this.applyStored(stored)
      this.source = 'qr'
      this.logger.info('已加载 B 站登录会话', { uid: this.uid, uname: this.uname })
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        this.logger.warn('B 站会话文件无法读取，将忽略', {
          reason: error instanceof Error ? error.message : '未知错误',
        })
      }
    }

    if (this.envCookie) {
      this.setCookieString(this.envCookie)
      this.source = 'env'
      this.logger.info('使用 .env 中的 B 站 Cookie 兜底')
    }
  }

  private applyStored(stored: StoredSession): void {
    this.jar.clear()
    for (const [name, value] of Object.entries(stored.cookie)) this.jar.set(name, value)
    this.refreshToken = stored.refreshToken || ''
    this.uid = stored.uid ?? null
    this.uname = stored.uname ?? null
    this.face = stored.face ?? null
    this.updatedAt = stored.updatedAt ?? null
    this.needsReauth = Boolean(stored.needsReauth)
  }

  setCookieString(cookie: string): void {
    for (const part of cookie.split(';')) {
      const index = part.indexOf('=')
      if (index <= 0) continue
      const name = part.slice(0, index).trim()
      const value = part.slice(index + 1).trim()
      if (name && value) this.jar.set(name, value)
    }
  }

  mergeSetCookie(setCookies: readonly string[]): void {
    for (const raw of setCookies) {
      const pair = raw.split(';', 1)[0] ?? ''
      const index = pair.indexOf('=')
      if (index <= 0) continue
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      if (!name) continue
      if (!value || /max-age\s*=\s*0/i.test(raw)) this.jar.delete(name)
      else this.jar.set(name, value)
    }
  }

  get(name: string): string | undefined {
    return this.jar.get(name)
  }

  setCookie(name: string, value: string): void {
    if (value) this.jar.set(name, value)
  }

  getCookieHeader(): string {
    return [...this.jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  hasCookie(): boolean {
    return this.jar.size > 0
  }

  hasSession(): boolean {
    return this.jar.has('SESSDATA')
  }

  getRefreshToken(): string {
    return this.refreshToken
  }

  setRefreshToken(token: string): void {
    this.refreshToken = token
  }

  setIdentity(uid: number | null, uname: string | null, face: string | null): void {
    this.uid = uid
    this.uname = uname
    this.face = face
  }

  setSource(source: Source): void {
    this.source = source
  }

  setNeedsReauth(value: boolean): void {
    this.needsReauth = value
  }

  touch(): void {
    this.updatedAt = Date.now()
  }

  snapshot(): BiliStatus {
    return {
      loggedIn: this.hasSession() && !this.needsReauth,
      uid: this.uid,
      uname: this.uname,
      face: this.face,
      source: this.source,
      needsReauth: this.needsReauth,
      updatedAt: this.updatedAt,
    }
  }

  async persist(): Promise<void> {
    if (this.source !== 'qr' || !this.hasSession()) return
    const stored: StoredSession = {
      v: 1,
      cookie: Object.fromEntries(this.jar),
      refreshToken: this.refreshToken,
      uid: this.uid,
      uname: this.uname,
      face: this.face,
      updatedAt: this.updatedAt,
      needsReauth: this.needsReauth,
    }
    await fs.promises.mkdir(this.dataDir, { recursive: true })
    const tmp = `${this.filePath}.${process.pid}.tmp`
    await fs.promises.writeFile(tmp, encryptJson(stored, this.secret), { mode: 0o600 })
    try {
      await fs.promises.rename(tmp, this.filePath)
    } catch {
      await fs.promises.rm(this.filePath, { force: true })
      await fs.promises.rename(tmp, this.filePath)
    }
  }

  async clear(): Promise<void> {
    this.jar.clear()
    this.refreshToken = ''
    this.uid = null
    this.uname = null
    this.face = null
    this.updatedAt = null
    this.needsReauth = false
    this.source = 'none'
    await fs.promises.rm(this.filePath, { force: true })
  }
}
