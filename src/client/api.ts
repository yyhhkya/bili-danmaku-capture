import type { ApiErrorBody } from '../shared/types.js'

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
