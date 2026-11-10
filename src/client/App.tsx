import { Broadcast, SignOut } from '@phosphor-icons/react'
import { useCallback, useState } from 'react'

import { BiliAccountPanel } from './components/BiliAccountPanel.js'
import { QrLoginDialog } from './components/QrLoginDialog.js'
import { StatusBanner } from './components/StatusBanner.js'
import { useAuth } from './hooks/useAuth.js'
import { useBiliAccount } from './hooks/useBiliAccount.js'
import { LoginPage } from './pages/LoginPage.js'
import { shanghaiDateTime } from '../shared/time.js'

export function App() {
  const auth = useAuth()

  if (auth.state === 'loading') return <BootScreen />
  if (auth.state === 'anonymous') {
    return <LoginPage submitting={auth.submitting} error={auth.error} onLogin={auth.login} />
  }
  return <AuthenticatedShell expiresAt={auth.expiresAt} onLogout={auth.logout} />
}

function BootScreen() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-ink-950 px-6">
      <div className="flex w-full max-w-xs flex-col items-center gap-4">
        <span className="grid size-11 place-items-center rounded-2xl border border-line bg-ink-850 text-accent">
          <Broadcast size={22} weight="regular" />
        </span>
        <div className="h-2 w-32 animate-pulse rounded-full bg-ink-800" />
        <div className="h-2 w-20 animate-pulse rounded-full bg-ink-800" />
      </div>
    </div>
  )
}

function AuthenticatedShell({
  expiresAt,
  onLogout,
}: {
  expiresAt: number | null
  onLogout: () => Promise<void>
}) {
  const { status, loading, startQr, pollQr, logout, refreshCookie, setStatus } = useBiliAccount()
  const [qrOpen, setQrOpen] = useState(false)

  const openQr = useCallback(() => setQrOpen(true), [])
  const closeQr = useCallback(() => setQrOpen(false), [])
  const handleBiliLogout = useCallback(async () => {
    await logout()
  }, [logout])

  const expiry = expiresAt ? shanghaiDateTime(expiresAt) : null

  return (
    <main className="grid min-h-[100dvh] grid-rows-[auto_auto_1fr] bg-ink-950">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
            <Broadcast size={18} weight="regular" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-100">弹幕监控</h1>
            <p className="truncate font-mono text-[11px] text-zinc-500">
              {expiry ? `会话至 ${expiry}` : '已登录'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <BiliAccountPanel
            status={status}
            loading={loading}
            onQrLogin={openQr}
            onLogout={handleBiliLogout}
            onRefreshCookie={refreshCookie}
          />
          <button
            type="button"
            onClick={() => void onLogout()}
            aria-label="退出站点登录"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-line-strong hover:text-zinc-100 active:scale-[0.98]"
          >
            <SignOut size={15} weight="regular" />
            <span className="hidden sm:inline">退出</span>
          </button>
        </div>
      </header>

      <StatusBanner status={status} onLogin={openQr} />

      <section className="grid place-items-center px-6 py-16">
        <div className="max-w-lg text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">signed in</p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-100">
            访问已验证
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            接下来接入房间管理与实时弹幕流，监控台会在这里展开。
          </p>
        </div>
      </section>

      <QrLoginDialog
        open={qrOpen}
        onClose={closeQr}
        startQr={startQr}
        pollQr={pollQr}
        onAccountUpdated={setStatus}
      />
    </main>
  )
}
