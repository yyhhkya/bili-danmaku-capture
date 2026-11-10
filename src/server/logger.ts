import { shanghaiDateTime } from '../shared/time.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

const SENSITIVE_PATTERN =
  /((?:sessdata|bili_jct|refresh_token|access_key|session_secret|dedeuserid(?:_ckmd5)?|authorization)\s*[=:]\s*)([^;\s,]+)/gi

/** 去掉可能出现在日志中的凭证片段。 */
export function redact(text: string): string {
  return text.replace(SENSITIVE_PATTERN, '$1[已隐藏]')
}

function formatMeta(meta: Record<string, unknown> | undefined): string {
  if (!meta || Object.keys(meta).length === 0) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(meta)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    parts.push(`${key}=${redact(text ?? '')}`)
  }
  return ` ${parts.join(' ')}`
}

export function createLogger(level: LogLevel = 'info'): Logger {
  const threshold = LEVEL_WEIGHT[level]

  const write = (logLevel: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (LEVEL_WEIGHT[logLevel] < threshold) return
    const line = `${shanghaiDateTime()} ${logLevel.toUpperCase()} ${redact(message)}${formatMeta(meta)}`
    if (logLevel === 'error') console.error(line)
    else if (logLevel === 'warn') console.warn(line)
    else console.log(line)
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  }
}
