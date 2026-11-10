import { Broadcast, SignOut } from '@phosphor-icons/react'

import { useAuth } from './hooks/useAuth.js'
import { LoginPage } from './pages/LoginPage.js'

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
  const expiry = expiresAt
    ? new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Shanghai',
      }).format(expiresAt)
    : null

  return (
    <main className="grid min-h-[100dvh] grid-rows-[auto_1fr] bg-ink-950">
      <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
            <Broadcast size={18} weight="regular" />
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">弹幕监控</h1>
            <p className="font-mono text-[11px] text-zinc-500">
              {expiry ? `会话至 ${expiry}` : '已登录'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-line-strong hover:text-zinc-100 active:scale-[0.98]"
        >
          <SignOut size={15} weight="regular" />
          退出登录
        </button>
      </header>

      <section className="grid place-items-center px-6 py-16">
        <div className="max-w-lg text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">signed in</p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-100">
            访问已验证
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            接下来接入 B 站扫码登录、房间管理与实时弹幕流，监控台会在这里展开。
          </p>
        </div>
      </section>
    </main>
  )
}
