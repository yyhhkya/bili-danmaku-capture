export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

export interface AuthMeResponse {
  authenticated: boolean
  expiresAt?: number
}

export interface LoginResponse {
  authenticated: boolean
  expiresAt: number
}

export type BiliLoginSource = 'qr' | 'env' | 'none'

export interface BiliStatus {
  loggedIn: boolean
  uid: number | null
  uname: string | null
  face: string | null
  source: BiliLoginSource
  needsReauth: boolean
  updatedAt: number | null
}

export interface BiliQrStartResponse {
  handle: string
  image: string
  expiresAt: number
}

export type BiliQrStatus = 'waiting' | 'scanned' | 'success' | 'expired' | 'error'

export interface BiliQrPollResponse {
  status: BiliQrStatus
  message: string
  account?: BiliStatus
}

export type BiliRefreshStatus = 'fresh' | 'refreshed' | 'skipped' | 'needs-reauth' | 'throttled'

export interface BiliRefreshResponse {
  status: BiliRefreshStatus
  message: string
  checkedAt: number
  account: BiliStatus
}

export type EventType = 'danmaku' | 'superchat' | 'gift' | 'guard' | 'enter' | 'follow'

export interface EventMedal {
  level: number
  name: string
  anchorUname?: string
  color?: string
}

export interface EventUser {
  uid: number
  uname: string
  face?: string
  guardLevel: number
  isAdmin?: boolean
  medal?: EventMedal
}

export interface NormalizedEvent {
  v: 1
  id: string
  roomId: number
  type: EventType
  ts: number
  receivedAt: number
  user: EventUser
  text: string
  color?: string
  price?: number
  extra?: {
    giftName?: string
    num?: number
    guardName?: string
    duration?: number
  }
}

export type RoomConnectionState =
  | 'idle'
  | 'resolving'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'closed'

export interface RoomSummary {
  roomId: number
  inputRoomId: number
  shortId: number
  title: string
  uname: string
  face: string
  cover: string
  areaName: string
  liveStatus: 0 | 1 | 2
  online: number
  popularity: number
  connection: RoomConnectionState
  messageRate: number
  addedAt: number
  lastEventAt: number | null
  lastError?: string
}

export interface RoomHistoryResponse {
  date: string
  events: NormalizedEvent[]
}

export interface RoomDatesResponse {
  dates: Array<{ date: string; size: number }>
}

