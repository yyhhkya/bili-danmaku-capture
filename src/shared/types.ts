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

