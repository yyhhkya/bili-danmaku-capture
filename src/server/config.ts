import path from 'node:path'

export interface BiliConfig {
  /** .env 中提供的兜底 Cookie，可为空 */
  cookie: string
  /** Cookie 续期检查间隔 */
  refreshCheckMs: number
}

export interface AppConfig {
  accessKey: string
  sessionSecret: string
  sessionDays: number
  port: number
  host: string
  maxRooms: number
  cookieSecure: boolean
  dataDir: string
  clientDir: string
  bili: BiliConfig
}

const SIX_HOURS = 6 * 60 * 60 * 1000

/** 读取项目根目录的 .env；不存在时允许继续（由必填校验给出明确错误）。 */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile()
  } catch {
    // 没有 .env 时由 loadConfig 的必填校验提示
  }
}

function readInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback
  return parsed
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value.trim().toLowerCase() === 'true'
}

function cleanCookie(value: string | undefined): string {
  return (value ?? '').replace(/[\r\n]+/g, ' ').trim()
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const accessKey = env.ACCESS_KEY?.trim() ?? ''
  const sessionSecret = env.SESSION_SECRET?.trim() ?? ''

  const missing: string[] = []
  if (!accessKey) missing.push('ACCESS_KEY')
  if (!sessionSecret) missing.push('SESSION_SECRET')
  if (missing.length > 0) {
    throw new Error(`缺少必填环境变量：${missing.join('、')}。请复制 .env.example 为 .env 后填写。`)
  }
  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET 至少需要 32 个字符。')
  }

  return {
    accessKey,
    sessionSecret,
    sessionDays: readInt(env.SESSION_DAYS, 7, 1, 365),
    port: readInt(env.APP_PORT, readInt(env.PORT, 3000, 1, 65535), 1, 65535),
    host: env.HOST?.trim() || '127.0.0.1',
    maxRooms: readInt(env.MAX_ROOMS, 10, 1, 50),
    cookieSecure: readBool(env.COOKIE_SECURE, false),
    dataDir: path.resolve(env.DATA_DIR?.trim() || 'data'),
    clientDir: path.resolve('dist/client'),
    bili: {
      cookie: cleanCookie(env.BILI_COOKIE),
      refreshCheckMs: readInt(env.BILI_REFRESH_CHECK_MS, SIX_HOURS, 5 * 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    },
  }
}
