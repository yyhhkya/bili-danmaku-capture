import { useCallback, useEffect, useState } from 'react'

import type { AuthMeResponse, LoginResponse } from '../../shared/types.js'
import { ApiError, apiFetch } from '../api.js'

export type AuthState = 'loading' | 'anonymous' | 'authenticated'

export function useAuth() {
  const [state, setState] = useState<AuthState>('loading')
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<AuthMeResponse>('/api/auth/me')
      if (result.authenticated) {
        setState('authenticated')
        setExpiresAt(result.expiresAt ?? null)
      } else {
        setState('anonymous')
        setExpiresAt(null)
      }
    } catch {
      setState('anonymous')
      setExpiresAt(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (key: string): Promise<boolean> => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ key }),
      })
      setExpiresAt(result.expiresAt)
      setState('authenticated')
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请稍后重试')
      return false
    } finally {
      setSubmitting(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch<unknown>('/api/auth/logout', { method: 'POST' })
    } catch {
      // 本地清除即可
    }
    setState('anonymous')
    setExpiresAt(null)
  }, [])

  return { state, expiresAt, error, submitting, login, logout, refresh }
}
