import { randomUUID } from 'node:crypto'

import type {
  EventEmoticon,
  EventMedal,
  EventType,
  EventUser,
  NormalizedEvent,
} from '../../shared/types.js'
import { decodeInteractWordV2 } from './protobuf.js'

type Rec = Record<string, unknown>

interface Context {
  roomId: number
  receivedAt: number
}

function asRecord(value: unknown): Rec | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : undefined
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function pickString(a: unknown, b: unknown): string {
  const first = asString(a)
  return first || asString(b)
}

function pickNumber(a: unknown, b: unknown, fallback = 0): number {
  const first = Number(a)
  if (Number.isFinite(first) && a !== undefined && a !== null) return first
  const second = Number(b)
  return Number.isFinite(second) && b !== undefined && b !== null ? second : fallback
}

function secondsToMs(value: unknown): number {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
}

function colorFromDecimal(value: unknown): string | undefined {
  const color = Number(value)
  if (!Number.isFinite(color) || color < 0) return undefined
  return `#${(Math.floor(color) & 0xffffff).toString(16).padStart(6, '0')}`
}

function parseJsonString(value: unknown): Rec | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  try {
    return asRecord(JSON.parse(value))
  } catch {
    return undefined
  }
}

function normalizeEmoteUrl(value: unknown): string | undefined {
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

function extractEmoticons(value: unknown): Record<string, EventEmoticon> | undefined {
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

function medalFromObject(
  medal: Rec | undefined,
  levelKey = 'medal_level',
  nameKey = 'medal_name',
  anchorKey = 'anchor_uname',
): EventMedal | undefined {
  if (!medal) return undefined
  const name = asString(medal[nameKey])
  if (!name) return undefined
  return {
    level: asNumber(medal[levelKey]),
    name,
    anchorUname: asString(medal[anchorKey]) || undefined,
    color: colorFromDecimal(medal.medal_color_start ?? medal.medal_color),
  }
}

function baseEvent(
  ctx: Context,
  type: EventType,
  user: EventUser,
  text: string,
  extra: Partial<
    Pick<NormalizedEvent, 'color' | 'price' | 'extra' | 'id' | 'ts' | 'emoticons'>
  >,
): NormalizedEvent {
  return {
    v: 1,
    id: extra.id || randomUUID(),
    roomId: ctx.roomId,
    type,
    ts: extra.ts && extra.ts > 0 ? extra.ts : ctx.receivedAt,
    receivedAt: ctx.receivedAt,
    user,
    text,
    color: extra.color,
    price: extra.price,
    emoticons: extra.emoticons,
    extra: extra.extra,
  }
}

function normalizeDanmaku(payload: Rec, ctx: Context): NormalizedEvent {
  const info = asArray(payload.info) ?? []
  const meta = asArray(info[0]) ?? []
  const metaExtra = asRecord(meta[15])
  const extra = parseJsonString(metaExtra?.extra)
  const emoticons = extractEmoticons(extra?.emots)
  const userObj = asRecord(metaExtra?.user)
  const base = asRecord(userObj?.base)
  const userMedal = asRecord(userObj?.medal)
  const info2 = asArray(info[2]) ?? []
  const info3 = asArray(info[3]) ?? []
  const guard = asRecord(userObj?.guard)

  const uid = pickNumber(userObj?.uid, info2[0])
  const uname = pickString(base?.name, info2[1])
  const face = asString(base?.face) || undefined

  let medal: EventMedal | undefined
  if (info3.length >= 3 && asString(info3[1])) {
    medal = {
      level: asNumber(info3[0]),
      name: asString(info3[1]),
      anchorUname: asString(info3[2]) || undefined,
      color: colorFromDecimal(info3[4]),
    }
  } else {
    medal = medalFromObject(userMedal)
  }

  const ts = secondsToMs(asRecord(info[9])?.ts) || asNumber(meta[4]) || ctx.receivedAt

  return baseEvent(
    ctx,
    'danmaku',
    {
      uid,
      uname,
      face,
      guardLevel: pickNumber(info[7], guard?.level),
      isAdmin: asNumber(info2[2]) === 1 || undefined,
      medal,
    },
    asString(info[1]),
    {
      id: pickString(payload.msg_id, extra?.id_str) || undefined,
      ts,
      color: colorFromDecimal(meta[3]),
      emoticons,
    },
  )
}

function normalizeSuperChat(payload: Rec, ctx: Context): NormalizedEvent | null {
  const data = asRecord(payload.data)
  if (!data) return null
  const userInfo = asRecord(data.user_info)
  const medalInfo = asRecord(data.medal_info)

  return baseEvent(
    ctx,
    'superchat',
    {
      uid: asNumber(data.uid),
      uname: asString(userInfo?.uname),
      face: asString(userInfo?.face) || undefined,
      guardLevel: asNumber(userInfo?.guard_level, asNumber(medalInfo?.guard_level)),
      medal: medalFromObject(medalInfo),
    },
    asString(data.message),
    {
      id: data.id ? `sc-${asNumber(data.id)}` : undefined,
      ts: secondsToMs(data.ts) || secondsToMs(data.start_time) || ctx.receivedAt,
      price: asNumber(data.price),
      extra: { duration: asNumber(data.time) || undefined },
    },
  )
}

function normalizeGift(payload: Rec, ctx: Context): NormalizedEvent | null {
  const data = asRecord(payload.data)
  if (!data) return null
  const count = Math.max(1, asNumber(data.num, 1))
  const giftName = pickString(data.giftName, data.gift_name) || '礼物'
  const medalInfo = asRecord(data.medal_info)

  return baseEvent(
    ctx,
    'gift',
    {
      uid: asNumber(data.uid),
      uname: asString(data.uname),
      face: asString(data.face) || undefined,
      guardLevel: asNumber(data.guard_level),
      medal: medalFromObject(medalInfo),
    },
    `投喂 ${giftName} ×${count}`,
    {
      ts: secondsToMs(data.timestamp) || ctx.receivedAt,
      price: asNumber(data.total_coin, asNumber(data.price) * count),
      extra: { giftName, num: count },
    },
  )
}

function normalizeGuard(payload: Rec, ctx: Context): NormalizedEvent | null {
  const data = asRecord(payload.data)
  if (!data) return null
  const level = asNumber(data.guard_level)
  const guardName = level === 1 ? '总督' : level === 2 ? '提督' : level === 3 ? '舰长' : '大航海'

  return baseEvent(
    ctx,
    'guard',
    {
      uid: asNumber(data.uid),
      uname: asString(data.username),
      guardLevel: level,
    },
    `开通${guardName}`,
    {
      ts: secondsToMs(data.start_time) || ctx.receivedAt,
      price: asNumber(data.price) > 0 ? asNumber(data.price) / 1000 : undefined,
      extra: { guardName, num: Math.max(1, asNumber(data.num, 1)) },
    },
  )
}

function interactType(msgType: number): EventType | null {
  if (msgType === 1) return 'enter'
  if (msgType === 2) return 'follow'
  return null
}

function normalizeInteract(payload: Rec, ctx: Context): NormalizedEvent | null {
  const data = asRecord(payload.data)
  if (!data) return null
  const type = interactType(asNumber(data.msg_type))
  if (!type) return null
  const medal = asRecord(data.fans_medal)

  return baseEvent(
    ctx,
    type,
    {
      uid: asNumber(data.uid),
      uname: asString(data.uname),
      guardLevel: asNumber(medal?.guard_level),
      medal: medalFromObject(medal, 'medal_level', 'medal_name', 'anchor_uname'),
    },
    type === 'enter' ? '进入直播间' : '关注了主播',
    { ts: secondsToMs(data.timestamp) || ctx.receivedAt },
  )
}

function normalizeInteractV2(payload: Rec, ctx: Context): NormalizedEvent | null {
  const pb = asString(asRecord(payload.data)?.pb)
  if (!pb) return null
  const decoded = decodeInteractWordV2(Buffer.from(pb, 'base64'))
  if (!decoded) return null
  const type = interactType(decoded.msgType)
  if (!type) return null

  return baseEvent(
    ctx,
    type,
    {
      uid: decoded.uid,
      uname: decoded.uname,
      face: decoded.face || undefined,
      guardLevel: 0,
      medal: decoded.medal,
    },
    type === 'enter' ? '进入直播间' : '关注了主播',
    { ts: secondsToMs(decoded.timestampSec) || ctx.receivedAt },
  )
}

export function normalizeMessage(
  payload: unknown,
  ctx: { roomId: number; receivedAt?: number },
): NormalizedEvent | null {
  const record = asRecord(payload)
  if (!record) return null
  const cmd = asString(record.cmd)
  if (!cmd) return null

  const context: Context = { roomId: ctx.roomId, receivedAt: ctx.receivedAt ?? Date.now() }
  const baseCmd = cmd.split(':')[0]

  switch (baseCmd) {
    case 'DANMU_MSG':
      return normalizeDanmaku(record, context)
    case 'SUPER_CHAT_MESSAGE':
      return normalizeSuperChat(record, context)
    case 'SEND_GIFT':
      return normalizeGift(record, context)
    case 'GUARD_BUY':
      return normalizeGuard(record, context)
    case 'INTERACT_WORD':
      return normalizeInteract(record, context)
    case 'INTERACT_WORD_V2':
      return normalizeInteractV2(record, context)
    default:
      return null
  }
}
