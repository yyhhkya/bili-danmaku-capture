import type { Logger } from '../logger.js'
import type { BiliSessionStore } from './session.js'

export const BILI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export interface NavInfo {
  mid: number
  isLogin: boolean
  uname: string
  face: string
}

interface NavResponse {
  code: number
  message?: string
  data?: {
    isLogin?: boolean
    mid?: number
    uname?: string
    face?: string
    wbi_img?: { img_url?: string; sub_url?: string }
  }
}

export class BiliApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly endpoint: string,
  ) {
    super(message)
    this.name = 'BiliApiError'
  }
}

function refererFor(url: string): string {
  const { hostname } = new URL(url)
  if (hostname === 'passport.bilibili.com') return 'https://passport.bilibili.com/'
  if (hostname === 'api.bilibili.com') return 'https://www.bilibili.com/'
  return 'https://live.bilibili.com/'
}

export class BiliHttp {
  private navCache: { at: number; data: NavInfo } | null = null
  private navInFlight: Promise<NavInfo> | null = null

  constructor(
    private readonly session: BiliSessionStore,
    private readonly logger: Logger,
    private readonly timeoutMs = 10_000,
  ) {}

  private buildHeaders(url: string, init?: RequestInit): Headers {
    const headers = new Headers(init?.headers)
    if (!headers.has('User-Agent')) headers.set('User-Agent', BILI_UA)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json, text/plain, */*')
    if (!headers.has('Accept-Language')) headers.set('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')
    if (!headers.has('Referer')) headers.set('Referer', refererFor(url))
    const cookie = this.session.getCookieHeader()
    if (cookie) headers.set('Cookie', cookie)
    return headers
  }

  async request(url: string, init: RequestInit = {}, timeoutMs = this.timeoutMs): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: this.buildHeaders(url, init),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const setCookies = response.headers.getSetCookie?.() ?? []
    if (setCookies.length > 0) this.session.mergeSetCookie(setCookies)
    return response
  }

  async getJson<T>(url: string, init: RequestInit = {}, timeoutMs = this.timeoutMs): Promise<T> {
    const response = await this.request(url, init, timeoutMs)
    const text = await response.text()
    try {
      return JSON.parse(text) as T
    } catch {
      throw new BiliApiError(-1, `B 站接口返回非 JSON（HTTP ${response.status}）`, url)
    }
  }

  async getNav(force = false): Promise<NavInfo> {
    if (!force && this.navCache && Date.now() - this.navCache.at < 10 * 60 * 1000) {
      return this.navCache.data
    }
    if (this.navInFlight) return this.navInFlight

    this.navInFlight = (async () => {
      const data = await this.getJson<NavResponse>('https://api.bilibili.com/x/web-interface/nav')
      if (!data.data?.wbi_img) {
        throw new BiliApiError(data.code, data.message || '无法获取导航栏信息', 'nav')
      }
      const info: NavInfo = {
        mid: Number(data.data.mid ?? 0),
        isLogin: Boolean(data.data.isLogin),
        uname: data.data.uname ?? '',
        face: data.data.face ?? '',
      }
      this.navCache = { at: Date.now(), data: info }
      return info
    })()

    try {
      return await this.navInFlight
    } finally {
      this.navInFlight = null
    }
  }

  async ensureBuvid3(): Promise<string> {
    const existing = this.session.get('buvid3')
    if (existing) return existing

    const data = await this.getJson<{
      code: number
      message?: string
      data?: { b_3?: string; b_4?: string }
    }>('https://api.bilibili.com/x/frontend/finger/spi')

    if (data.code !== 0 || !data.data?.b_3) {
      throw new BiliApiError(data.code, data.message || '无法获取 buvid3', 'finger/spi')
    }
    this.session.setCookie('buvid3', data.data.b_3)
    if (data.data.b_4) this.session.setCookie('buvid4', data.data.b_4)
    this.logger.debug('已获取 buvid3')
    return data.data.b_3
  }
}
