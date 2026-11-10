import { Broadcast } from '@phosphor-icons/react'
import { lazy, Suspense, useEffect } from 'react'

import { useAuth } from './hooks/useAuth.js'
import { LoginPage } from './pages/LoginPage.js'

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage.js').then((module) => ({ default: module.DashboardPage })),
)

export function App() {
  const auth = useAuth()

  useEffect(() => {
    const handler = () => void auth.refresh()
    window.addEventListener('auth-expired', handler)
    return () => window.removeEventListener('auth-expired', handler)
  }, [auth.refresh])

  if (auth.state === 'loading') return <BootScreen />
  if (auth.state === 'anonymous') {
    return <LoginPage submitting={auth.submitting} error={auth.error} onLogin={auth.login} />
  }
  return (
    <Suspense fallback={<BootScreen />}>
      <DashboardPage expiresAt={auth.expiresAt} onLogout={auth.logout} />
    </Suspense>
  )
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
