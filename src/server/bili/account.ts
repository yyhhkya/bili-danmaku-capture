import type { Logger } from '../logger.js'
import type { BiliStatus } from '../../shared/types.js'
import type { BiliHttp } from './http.js'
import type { BiliSessionStore } from './session.js'

export class BiliAccount {
  private validating: Promise<BiliStatus> | null = null

  constructor(
    private readonly session: BiliSessionStore,
    private readonly http: BiliHttp,
    private readonly logger: Logger,
  ) {}

  async init(): Promise<void> {
    await this.session.load()
    if (!this.session.hasCookie()) return
    await this.refreshIdentity()
  }

  status(): BiliStatus {
    return this.session.snapshot()
  }

  getUid(): number {
    return this.session.snapshot().uid ?? 0
  }

  getCookieHeader(): string {
    return this.session.getCookieHeader()
  }

  ensureBuvid3(): Promise<string> {
    return this.http.ensureBuvid3()
  }

  refreshIdentity(): Promise<BiliStatus> {
    if (this.validating) return this.validating

    const run = (async () => {
      try {
        const nav = await this.http.getNav(true)
        if (nav.isLogin) {
          this.session.setIdentity(nav.mid, nav.uname, nav.face)
          this.session.setNeedsReauth(false)
          this.session.touch()
        } else if (this.session.hasCookie()) {
          this.session.setNeedsReauth(true)
        }
        await this.session.persist()
      } catch (error) {
        if (this.session.hasCookie()) this.session.setNeedsReauth(true)
        this.logger.warn('刷新 B 站账号信息失败', {
          reason: error instanceof Error ? error.message : '未知错误',
        })
      }
      return this.session.snapshot()
    })()

    this.validating = run
    void run.then(() => {
      if (this.validating === run) this.validating = null
    })
    return run
  }

  async onQrSuccess(refreshToken: string): Promise<BiliStatus> {
    this.session.setSource('qr')
    if (refreshToken) this.session.setRefreshToken(refreshToken)
    this.session.setNeedsReauth(false)
    this.session.touch()
    await this.session.persist()
    return this.refreshIdentity()
  }

  async logout(): Promise<BiliStatus> {
    await this.session.clear()
    return this.session.snapshot()
  }
}
