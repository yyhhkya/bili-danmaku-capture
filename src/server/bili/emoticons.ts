import type { EventEmoticon } from '../../shared/types.js'

type Rec = Record<string, unknown>

export interface JsonHttp {
  getJson<T>(url: string, init?: RequestInit): Promise<T>
}

interface HistoryMessage {
  emoticon?: unknown
  emots?: unknown
}

interface HistoryResponse {
  code: number
  message?: string
  data?: {
    room?: HistoryMessage[]
    admin?: HistoryMessage[]
  }
}

function asRecord(value: unknown): Rec | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : undefined
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeEmoteUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    const host = url.hostname.toLowerCase()
    if (host !== 'hdslb.com' && !host.endsWith('.hdslb.com')) return undefined
    // B 站部分表情地址是 http，页面在 https 下会被混合内容拦截。
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return undefined
  }
}

export function extractEmoticons(value: unknown): Record<string, EventEmoticon> | undefined {
  const source = asRecord(value)
  if (!source) return undefined

  const result: Record<string, EventEmoticon> = {}
  for (const [token, raw] of Object.entries(source)) {
    if (!token || token.length > 64) continue
    const info = asRecord(raw)
    const url = normalizeEmoteUrl(info?.url)
    if (!url) continue
    result[token] = {
      url,
      width: Math.max(1, asNumber(info?.width, 20)),
      height: Math.max(1, asNumber(info?.height, 20)),
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/** 解析消息里的单个表情对象，兼容 JSON 字符串与 upower_ 标识。 */
export function extractEmoticonObject(value: unknown): [string, EventEmoticon] | null {
  let candidate = value
  if (typeof candidate === 'string') {
    if (!candidate.trim().startsWith('{')) return null
    try {
      candidate = JSON.parse(candidate)
    } catch {
      return null
    }
  }
  const info = asRecord(candidate)
  if (!info) return null

  const url = normalizeEmoteUrl(info.url)
  if (!url) return null

  let token = asString(info.text) || asString(info.emoji)
  if (!token) {
    const unique = asString(info.emoticon_unique)
    const bracket = unique.indexOf('[')
    if (bracket >= 0) token = unique.slice(bracket)
  }
  if (!token) return null
  if (!token.startsWith('[')) token = `[${token}]`
  if (!token.endsWith(']')) token = `${token}]`

  return [
    token,
    {
      url,
      width: Math.max(1, asNumber(info.width, 20)),
      height: Math.max(1, asNumber(info.height, 20)),
    },
  ]
}

/** 只保留文本中实际出现的表情，避免把整张表情表写进每条事件。 */
export function pickUsedEmoticons(
  text: string,
  dictionary: Record<string, EventEmoticon>,
): Record<string, EventEmoticon> | undefined {
  const result: Record<string, EventEmoticon> = {}
  for (const [token, info] of Object.entries(dictionary)) {
    if (text.includes(token)) result[token] = info
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * 直播间自定义表情（upower/装扮）不会出现在 extra.emots 和 GetEmoticons 中，
 * 但历史弹幕接口会在 emoticon 字段里返回图片地址。这里把最近消息里的表情汇总成字典。
 */
export async function fetchRecentEmoticons(
  http: JsonHttp,
  realRoomId: number,
): Promise<Record<string, EventEmoticon>> {
  const data = await http.getJson<HistoryResponse>(
    `https://api.live.bilibili.com/xlive/web-room/v1/dM/gethistory?roomid=${realRoomId}`,
  )
  if (data.code !== 0) return {}

  const result: Record<string, EventEmoticon> = {}
  const messages = [...(data.data?.admin ?? []), ...(data.data?.room ?? [])]
  for (const message of messages) {
    const single = extractEmoticonObject(message.emoticon)
    if (single) result[single[0]] = single[1]
    const multiple = extractEmoticons(message.emots)
    if (multiple) Object.assign(result, multiple)
  }
  return result
}
