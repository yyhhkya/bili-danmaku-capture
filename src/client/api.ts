import type {
  ApiErrorBody,
  RoomDatesResponse,
  RoomHistoryResponse,
  RoomSummary,
} from '../shared/types.js'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status: number, code = 'UNKNOWN') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers,
  })

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/login')) {
      window.dispatchEvent(new Event('auth-expired'))
    }
    let body: ApiErrorBody | null = null
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      // 非 JSON 错误响应
    }
    throw new ApiError(
      body?.error.message ?? `请求失败（${response.status}）`,
      response.status,
      body?.error.code ?? 'UNKNOWN',
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function fetchRooms(): Promise<RoomSummary[]> {
  return apiFetch<RoomSummary[]>('/api/rooms')
}

export async function addRoom(roomId: string): Promise<RoomSummary> {
  const result = await apiFetch<{ room: RoomSummary }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ roomId }),
  })
  return result.room
}

export function removeRoom(roomId: number): Promise<void> {
  return apiFetch<void>(`/api/rooms/${roomId}`, { method: 'DELETE' })
}

export function reconnectRoom(roomId: number): Promise<RoomSummary> {
  return apiFetch<RoomSummary>(`/api/rooms/${roomId}/reconnect`, { method: 'POST' })
}

export function fetchHistory(
  roomId: number,
  date?: string,
  limit = 200,
  before: number | null = null,
): Promise<RoomHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (date) params.set('date', date)
  if (before !== null) params.set('before', String(before))
  return apiFetch<RoomHistoryResponse>(`/api/rooms/${roomId}/history?${params.toString()}`)
}

export function fetchDates(roomId: number): Promise<RoomDatesResponse> {
  return apiFetch<RoomDatesResponse>(`/api/rooms/${roomId}/dates`)
}

export function exportHref(roomId: number, date?: string): string {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  return `/api/rooms/${roomId}/export${query}`
}
