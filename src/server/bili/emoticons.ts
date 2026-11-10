import type { EventEmoticon, NormalizedEvent } from '../../shared/types.js'

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

/** 校验并规范化一条表情记录，用于读取本地缓存。 */
export function normalizeEmoticonEntry(value: unknown): EventEmoticon | null {
  const info = asRecord(value)
  const url = normalizeEmoteUrl(info?.url)
  if (!url) return null
  return {
    url,
    width: Math.max(1, asNumber(info?.width, 20)),
    height: Math.max(1, asNumber(info?.height, 20)),
  }
}

const EMOTE_TOKEN_PATTERN = /\[[^[\]]{1,64}\]/g

/**
 * 用字典给弹幕补表情。
 * 带方括号的 token 直接匹配；纯表情消息的正文可能不带方括号（如「坠入爱河」），
 * 这种情况下只在消息带 `emoticonUnique` 时按裸文本匹配，避免把普通词误判成表情。
 */
export function fillEventEmoticons(
  event: NormalizedEvent,
  dictionary: Record<string, EventEmoticon>,
): boolean {
  if (event.type !== 'danmaku') return false
  let changed = false

  for (const token of event.text.match(EMOTE_TOKEN_PATTERN) ?? []) {
    const info = dictionary[token]
    if (!info || event.emoticons?.[token]) continue
    event.emoticons = { ...(event.emoticons ?? {}), [token]: info }
    changed = true
  }

  if (!event.emoticonUnique) return changed
  const bareText = event.text.trim()
  for (const [token, info] of Object.entries(dictionary)) {
    if (token.length < 3 || !token.startsWith('[') || !token.endsWith(']')) continue
    const bare = token.slice(1, -1)
    // 只认「整条消息就是一个表情名」的裸文本，避免普通词被误判。
    if (!bare || bareText !== bare || event.emoticons?.[bare]) continue
    event.emoticons = { ...(event.emoticons ?? {}), [bare]: info }
    changed = true
  }
  return changed
}

/**
 * 历史弹幕接口会在 emoticon 字段里返回图片地址，可作为包级字典的补充，
 * 覆盖 GetEmoticons 未开放的房间表情。这里把最近消息里的表情汇总成字典。
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

interface PackageEmoticon {
  emoji?: unknown
  descript?: unknown
  emoticon_unique?: unknown
  url?: unknown
  width?: unknown
  height?: unknown
}

interface PackageGroup {
  pkg_name?: unknown
  pkg_type?: unknown
  emoticons?: unknown
}

interface PackagesResponse {
  code: number
  message?: string
  data?: { data?: unknown }
}

/** 同一 token 出现在多个包时的取舍：UP主大表情 > 房间专属 > 其它 > 公共表情。 */
const PACK_RANK: Record<string, number> = {
  emoji: 0,
  通用表情: 0,
  房间专属表情: 2,
  UP主大表情: 3,
}

function tokenFromEmoji(value: unknown): string | null {
  let token = asString(value).trim()
  if (!token || token.length > 60) return null
  if (!token.startsWith('[')) token = `[${token}]`
  if (!token.endsWith(']')) token = `${token}]`
  return token.length <= 64 ? token : null
}

/** 把 GetEmoticons 的返回解析成 token → 图片；非法地址与公共包重复项按规则过滤。 */
export function parseEmoticonPackages(payload: unknown): Record<string, EventEmoticon> {
  const groups = asRecord(asRecord(payload)?.data)?.data
  if (!Array.isArray(groups)) return {}

  const result: Record<string, EventEmoticon> = {}
  const ranks: Record<string, number> = {}
  for (const rawGroup of groups) {
    const group = asRecord(rawGroup)
    if (!group) continue
    const rank = PACK_RANK[asString(group.pkg_name)] ?? 1
    const list = Array.isArray(group.emoticons) ? group.emoticons : []
    for (const rawItem of list) {
      const item = rawItem as PackageEmoticon
      const token = tokenFromEmoji(item.emoji) ?? tokenFromEmoji(item.descript)
      if (!token) continue
      const entry = normalizeEmoticonEntry(item)
      if (!entry) continue
      const previous = ranks[token]
      if (previous !== undefined && previous > rank) continue
      result[token] = entry
      ranks[token] = rank
    }
  }
  return result
}

/** 拉取直播间可用的表情包（UP主大表情、房间专属表情等），Cookie 只读接口。 */
export async function fetchRoomEmoticonPackages(
  http: JsonHttp,
  realRoomId: number,
): Promise<Record<string, EventEmoticon>> {
  const data = await http.getJson<PackagesResponse>(
    `https://api.live.bilibili.com/xlive/web-ucenter/v2/emoticon/GetEmoticons?platform=pc&room_id=${realRoomId}`,
  )
  if (data.code !== 0) return {}
  return parseEmoticonPackages(data)
}
