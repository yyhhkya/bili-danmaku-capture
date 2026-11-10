import { useCallback, useEffect, useState } from 'react'

import type {
  BiliQrPollResponse,
  BiliQrStartResponse,
  BiliRefreshResponse,
  BiliStatus,
} from '../../shared/types.js'
import { ApiError, apiFetch } from '../api.js'

export function useBiliAccount() {
  const [status, setStatus] = useState<BiliStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await apiFetch<BiliStatus>('/api/bili/status'))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '无法获取 B 站账号状态')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const startQr = useCallback(
    () => apiFetch<BiliQrStartResponse>('/api/bili/qr', { method: 'POST' }),
    [],
  )

  const pollQr = useCallback(
    (handle: string) => apiFetch<BiliQrPollResponse>(`/api/bili/qr/${handle}`),
    [],
  )

  const logout = useCallback(async () => {
    const next = await apiFetch<BiliStatus>('/api/bili/logout', { method: 'POST' })
    setStatus(next)
  }, [])

  const refreshCookie = useCallback(async () => {
    const result = await apiFetch<BiliRefreshResponse>('/api/bili/refresh', { method: 'POST' })
    setStatus(result.account)
    return result
  }, [])

  return {
    status,
    loading,
    error,
    refresh,
    startQr,
    pollQr,
    logout,
    refreshCookie,
    setStatus,
  }
}
