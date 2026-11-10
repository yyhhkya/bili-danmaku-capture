import { constants, publicEncrypt } from 'node:crypto'

import type { Logger } from '../logger.js'
import type { BiliRefreshStatus } from '../../shared/types.js'
import type { BiliSessionStore } from './session.js'

const REFRESH_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg
Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71
nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40
JNrRuoEUXpabUzGB8QIDAQAB
-----END PUBLIC KEY-----`

const COOKIE_INFO_URL = 'https://passport.bilibili.com/x/passport-login/web/cookie/info'
const CORRESPOND_URL = 'https://www.bilibili.com/correspond/1'
const REFRESH_URL = 'https://passport.bilibili.com/x/passport-login/web/cookie/refresh'
const CONFIRM_URL = 'https://passport.bilibili.com/x/passport-login/web/confirm/refresh'

export interface HttpLike {
  request(url: string, init?: RequestInit): Promise<Response>
  getJson<T>(url: string, init?: RequestInit): Promise<T>
}

export interface CookieRefreshResult {
  status: BiliRefreshStatus
  message: string
  checkedAt: number
}

interface CookieInfoResponse {
  code: number
  message?: string
  data?: { refresh?: boolean; timestamp?: number }
}

interface RefreshResponse {
  code: number
  message?: string
  data?: { status?: number; refresh_token?: string }
}

interface ConfirmResponse {
  code: number
  message?: string
}

/** 用文档给定的公钥对 refresh_<timestamp> 做 RSA-OAEP(SHA-256)，输出小写 hex。 */
export function buildCorrespondPath(timestamp: number, publicKey = REFRESH_PUBLIC_KEY): string {
  const encrypted = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(`refresh_${timestamp}`, 'utf8'),
  )
  return encrypted.toString('hex')
}

/** 从对应页面中提取 refresh_csrf。 */
export function parseRefreshCsrf(html: string): string | null {
  const match = html.match(/id="1-name"[^>]*>([^<]+)</)
  const value = match?.[1]?.trim()
  return value ? value : null
}

export class CookieRefreshService {
  private inFlight: Promise<CookieRefreshResult> | null = null
  private lastAttemptAt = 0
  private timer: NodeJS.Timeout | null = null
  private initialTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly session: BiliSessionStore,
    private readonly http: HttpLike,
    private readonly logger: Logger,
    private readonly minIntervalMs = 5 * 60 * 1000,
  ) {}

  /** 启动定时检查；首次检查延后 5 秒，避免阻塞启动。 */
  start(intervalMs: number): void {
    this.stop()
    this.initialTimer = setTimeout(() => {
      void this.run(false).catch((error: unknown) => {
        this.logger.warn('Cookie 续期检查失败', {
          reason: error instanceof Error ? error.message : '未知错误',
        })
      })
    }, 5000)
    this.initialTimer.unref()

    this.timer = setInterval(() => {
      void this.run(false).catch((error: unknown) => {
        this.logger.warn('Cookie 续期检查失败', {
          reason: error instanceof Error ? error.message : '未知错误',
        })
      })
    }, intervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.initialTimer) clearTimeout(this.initialTimer)
    this.timer = null
    this.initialTimer = null
  }

  run(force = false): Promise<CookieRefreshResult> {
    if (this.inFlight) return this.inFlight

    const now = Date.now()
    if (!force && now - this.lastAttemptAt < this.minIntervalMs) {
      return Promise.resolve({
        status: 'throttled',
        message: '刚刚检查过，无需重复续期',
        checkedAt: now,
      })
    }

    if (!this.session.hasSession()) {
      return Promise.resolve({
        status: 'skipped',
        message: '尚未登录 B 站',
        checkedAt: now,
      })
    }

    this.lastAttemptAt = now
    const run = this.execute().finally(() => {
      if (this.inFlight === run) this.inFlight = null
    })
    this.inFlight = run
    return run
  }

  private async markNeedsReauth(message: string, checkedAt: number): Promise<CookieRefreshResult> {
    this.session.setNeedsReauth(true)
    await this.session.persist()
    this.logger.warn('B 站登录需要重新扫码', { reason: message })
    return { status: 'needs-reauth', message, checkedAt }
  }

  private async execute(): Promise<CookieRefreshResult> {
    const checkedAt = Date.now()
    const csrf = this.session.get('bili_jct')

    if (!csrf) {
      return this.markNeedsReauth('缺少 bili_jct，无法检查续期', checkedAt)
    }

    let info: CookieInfoResponse
    try {
      const url = new URL(COOKIE_INFO_URL)
      url.searchParams.set('csrf', csrf)
      info = await this.http.getJson<CookieInfoResponse>(url.toString())
    } catch (error) {
      this.logger.warn('Cookie 续期检查请求失败', {
        reason: error instanceof Error ? error.message : '未知错误',
      })
      return { status: 'fresh', message: '检查失败，稍后重试', checkedAt }
    }

    if (info.code === -101) {
      return this.markNeedsReauth('B 站 Cookie 已失效，请重新扫码', checkedAt)
    }
    if (info.code !== 0) {
      this.logger.warn('Cookie 续期检查返回异常', {
        code: info.code,
        message: info.message ?? '',
      })
      return { status: 'fresh', message: info.message || '检查未成功，稍后重试', checkedAt }
    }
    if (!info.data?.refresh) {
      return { status: 'fresh', message: 'Cookie 仍在有效期内', checkedAt }
    }

    const refreshToken = this.session.getRefreshToken()
    if (!refreshToken) {
      return this.markNeedsReauth('缺少 refresh_token，请重新扫码', checkedAt)
    }

    const timestamp = info.data.timestamp ?? checkedAt
    const correspondPath = buildCorrespondPath(timestamp)
    const page = await this.http.request(`${CORRESPOND_URL}/${correspondPath}`, {
      headers: { Referer: 'https://www.bilibili.com/' },
    })
    const throttle = page.headers.get('bili-status-code')
    if (page.status === 404 || throttle === '352') {
      this.logger.warn('CorrespondPath 被拒绝，可能触发风控')
      return { status: 'fresh', message: '续期被拒绝，稍后重试', checkedAt }
    }

    const html = await page.text()
    const refreshCsrf = parseRefreshCsrf(html)
    if (!refreshCsrf) {
      this.logger.warn('无法解析 refresh_csrf，页面结构可能变化')
      return { status: 'fresh', message: '无法解析续期口令，稍后重试', checkedAt }
    }

    const refreshForm = new URLSearchParams({
      csrf,
      refresh_csrf: refreshCsrf,
      source: 'main_web',
      refresh_token: refreshToken,
    })
    const refreshed = await this.http.getJson<RefreshResponse>(REFRESH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://passport.bilibili.com/',
      },
      body: refreshForm.toString(),
    })

    if (refreshed.code !== 0) {
      if (refreshed.code === -101 || refreshed.code === 86095) {
        return this.markNeedsReauth('B 站 Cookie 续期失败，请重新扫码', checkedAt)
      }
      this.logger.warn('Cookie 续期请求失败', {
        code: refreshed.code,
        message: refreshed.message ?? '',
      })
      return { status: 'fresh', message: refreshed.message || '续期失败，稍后重试', checkedAt }
    }

    const newCsrf = this.session.get('bili_jct')
    if (!newCsrf) {
      return this.markNeedsReauth('续期后缺少 bili_jct，请重新扫码', checkedAt)
    }

    const confirmForm = new URLSearchParams({ csrf: newCsrf, refresh_token: refreshToken })
    try {
      const confirmed = await this.http.getJson<ConfirmResponse>(CONFIRM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: confirmForm.toString(),
      })
      if (confirmed.code !== 0) {
        this.logger.warn('Cookie 续期确认失败，旧口令可能仍有效', {
          code: confirmed.code,
        })
      }
    } catch (error) {
      this.logger.warn('Cookie 续期确认请求异常', {
        reason: error instanceof Error ? error.message : '未知错误',
      })
    }

    if (refreshed.data?.refresh_token) {
      this.session.setRefreshToken(refreshed.data.refresh_token)
    }
    this.session.setNeedsReauth(false)
    this.session.touch()
    await this.session.persist()
    this.logger.info('B 站 Cookie 已自动续期', { at: checkedAt })

    return { status: 'refreshed', message: 'Cookie 已续期', checkedAt }
  }
}
