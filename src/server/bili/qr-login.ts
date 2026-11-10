import { randomBytes } from 'node:crypto'

import QRCode from 'qrcode'

import type { BiliQrPollResponse, BiliQrStartResponse } from '../../shared/types.js'
import type { Logger } from '../logger.js'
import type { BiliAccount } from './account.js'
import type { BiliHttp } from './http.js'

interface PendingQr {
  qrcodeKey: string
  createdAt: number
}

interface QrGenerateResponse {
  code: number
  message?: string
  data?: { url?: string; qrcode_key?: string }
}

interface QrPollResponse {
  code: number
  message?: string
  data?: {
    url?: string
    refresh_token?: string
    timestamp?: number
    code?: number
    message?: string
  }
}

const QR_TTL_MS = 180_000
const START_WINDOW_MS = 60_000
const START_LIMIT = 5

export class QrRateLimitError extends Error {
  constructor() {
    super('二维码申请过于频繁，请稍后再试')
    this.name = 'QrRateLimitError'
  }
}

export class QrLoginService {
  private readonly pending = new Map<string, PendingQr>()
  private readonly starts = new Map<string, number[]>()

  constructor(
    private readonly http: BiliHttp,
    private readonly account: BiliAccount,
    private readonly logger: Logger,
  ) {}

  private prune(now: number): void {
    for (const [handle, entry] of this.pending) {
      if (now - entry.createdAt > QR_TTL_MS) this.pending.delete(handle)
    }
  }

  private checkStartRate(ip: string, now: number): void {
    const recent = (this.starts.get(ip) ?? []).filter((at) => now - at < START_WINDOW_MS)
    if (recent.length >= START_LIMIT) throw new QrRateLimitError()
    recent.push(now)
    this.starts.set(ip, recent)
  }

  async start(ip: string): Promise<BiliQrStartResponse> {
    const now = Date.now()
    this.prune(now)
    this.checkStartRate(ip, now)

    const data = await this.http.getJson<QrGenerateResponse>(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/generate',
    )
    if (data.code !== 0 || !data.data?.url || !data.data.qrcode_key) {
      throw new Error(data.message || 'B 站二维码申请失败')
    }

    const handle = randomBytes(18).toString('base64url')
    this.pending.set(handle, { qrcodeKey: data.data.qrcode_key, createdAt: now })

    let image: string
    try {
      image = await QRCode.toDataURL(data.data.url, {
        margin: 1,
        width: 280,
        errorCorrectionLevel: 'M',
      })
    } catch {
      this.pending.delete(handle)
      throw new Error('二维码图片生成失败')
    }

    this.logger.info('已申请 B 站扫码登录二维码')
    return { handle, image, expiresAt: now + QR_TTL_MS }
  }

  async poll(handle: string): Promise<BiliQrPollResponse> {
    const entry = this.pending.get(handle)
    if (!entry) {
      return { status: 'expired', message: '二维码已失效，请重新获取' }
    }
    if (Date.now() - entry.createdAt > QR_TTL_MS) {
      this.pending.delete(handle)
      return { status: 'expired', message: '二维码已超时，请重新获取' }
    }

    const url = new URL('https://passport.bilibili.com/x/passport-login/web/qrcode/poll')
    url.searchParams.set('qrcode_key', entry.qrcodeKey)
    const data = await this.http.getJson<QrPollResponse>(url.toString())

    if (data.code !== 0) {
      return { status: 'error', message: data.message || '扫码登录请求失败' }
    }

    switch (data.data?.code) {
      case 0: {
        this.pending.delete(handle)
        const account = await this.account.onQrSuccess(data.data.refresh_token ?? '')
        this.logger.info('B 站扫码登录成功', { uid: account.uid })
        return { status: 'success', message: '登录成功', account }
      }
      case 86101:
        return { status: 'waiting', message: '等待扫码' }
      case 86090:
        return { status: 'scanned', message: '已扫码，请在手机上确认' }
      case 86038:
        this.pending.delete(handle)
        return { status: 'expired', message: '二维码已失效，请重新获取' }
      default:
        return {
          status: 'error',
          message: data.data?.message || '扫码登录失败，请重试',
        }
    }
  }
}
