import type { BiliHttp } from './http.js'
import { BiliApiError } from './http.js'

export interface RoomInfo {
  realRoomId: number
  inputRoomId: number
  shortId: number
  anchorUid: number
  title: string
  liveStatus: 0 | 1 | 2
  online: number
  cover: string
  areaName: string
  liveTime: string
}

export interface AnchorInfo {
  uid: number
  uname: string
  face: string
  watched: number | null
}

export interface DanmuHost {
  host: string
  wssPort: number
}

export interface DanmuEndpoint {
  token: string
  hosts: DanmuHost[]
}

interface RoomInfoResponse {
  code: number
  message?: string
  data?: {
    uid?: number
    room_id?: number
    short_id?: number
    title?: string
    live_status?: number
    online?: number
    user_cover?: string
    area_name?: string
    live_time?: string
  }
}

interface AnchorResponse {
  code: number
  message?: string
  data?: {
    room_info?: { uid?: number }
    watched_show?: { num?: number }
    anchor_info?: {
      base_info?: { uid?: number; uname?: string; face?: string }
    }
  }
}

interface DanmuInfoResponse {
  code: number
  message?: string
  data?: {
    token?: string
    host_list?: Array<{ host?: string; wss_port?: number }>
  }
}

const ROOM_INFO_URL = 'https://api.live.bilibili.com/room/v1/Room/get_info'
const INFO_BY_ROOM_URL = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom'
const DANMU_INFO_URL = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo'

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function parseRoomInfo(data: RoomInfoResponse['data'], inputRoomId: number): RoomInfo {
  const liveStatusRaw = toNumber(data?.live_status, 0)
  const liveStatus = liveStatusRaw === 1 ? 1 : liveStatusRaw === 2 ? 2 : 0
  const realRoomId = toNumber(data?.room_id, inputRoomId)
  return {
    realRoomId,
    inputRoomId,
    shortId: toNumber(data?.short_id, 0),
    anchorUid: toNumber(data?.uid, 0),
    title: data?.title ?? `直播间 ${realRoomId}`,
    liveStatus,
    online: toNumber(data?.online, 0),
    cover: data?.user_cover ?? '',
    areaName: data?.area_name ?? '',
    liveTime: data?.live_time ?? '',
  }
}

export async function fetchRoomInfo(http: BiliHttp, roomId: number): Promise<RoomInfo> {
  const url = `${ROOM_INFO_URL}?room_id=${encodeURIComponent(String(roomId))}`
  const response = await http.getJson<RoomInfoResponse>(url)
  if (response.code !== 0 || !response.data) {
    throw new BiliApiError(response.code, response.message || '直播间不存在或接口异常', 'Room/get_info')
  }
  return parseRoomInfo(response.data, roomId)
}

export async function fetchAnchorInfo(
  http: BiliHttp,
  realRoomId: number,
): Promise<AnchorInfo | null> {
  const response = await http.getSigned<AnchorResponse>(INFO_BY_ROOM_URL, {
    room_id: realRoomId,
    web_location: '444.8',
  })
  if (response.code !== 0) return null
  const base = response.data?.anchor_info?.base_info
  const uname = base?.uname?.trim() ?? ''
  const watched = Number(response.data?.watched_show?.num)
  const watchedValue = Number.isFinite(watched) && watched >= 0 ? watched : null

  if (!uname) {
    return watchedValue === null
      ? null
      : { uid: 0, uname: '', face: '', watched: watchedValue }
  }

  return {
    uid: toNumber(base?.uid, toNumber(response.data?.room_info?.uid)),
    uname,
    face: base?.face ?? '',
    watched: watchedValue,
  }
}

export async function fetchDanmuEndpoint(
  http: BiliHttp,
  realRoomId: number,
): Promise<DanmuEndpoint> {
  await http.ensureBuvid3()
  const response = await http.getSigned<DanmuInfoResponse>(DANMU_INFO_URL, {
    id: realRoomId,
    type: 0,
    web_location: '444.8',
  })
  if (response.code !== 0 || !response.data?.token) {
    throw new BiliApiError(response.code, response.message || '无法获取弹幕服务信息', 'getDanmuInfo')
  }

  const hosts = (response.data.host_list ?? [])
    .filter((item): item is { host: string; wss_port: number } =>
      Boolean(item.host && item.wss_port),
    )
    .map((item) => ({ host: item.host, wssPort: item.wss_port }))

  if (hosts.length === 0) {
    throw new BiliApiError(-1, '弹幕服务器列表为空', 'getDanmuInfo')
  }
  return { token: response.data.token, hosts }
}
