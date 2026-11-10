import { Broadcast } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

type HealthState = 'checking' | 'online' | 'offline'

export function App() {
  const [health, setHealth] = useState<HealthState>('checking')

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/api/health')
        if (!cancelled) setHealth(res.ok ? 'online' : 'offline')
      } catch {
        if (!cancelled) setHealth('offline')
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="grid min-h-[100dvh] grid-rows-[auto_1fr] bg-ink-950">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
            <Broadcast size={20} weight="regular" />
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">弹幕监控</h1>
            <p className="font-mono text-[11px] text-zinc-500">bili-danmaku-capture</p>
          </div>
        </div>
        <HealthPill state={health} />
      </header>

      <section className="grid place-items-center px-6 py-16">
        <div className="max-w-md text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">setup</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
            项目骨架已就绪
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            接下来会接入单密钥登录、B 站扫码登录与 Cookie 续期、弹幕连接和实时监控界面。
          </p>
        </div>
      </section>
    </main>
  )
}

function HealthPill({ state }: { state: HealthState }) {
  const label = state === 'online' ? '服务正常' : state === 'offline' ? '服务不可用' : '检查中'
  const color =
    state === 'online' ? 'bg-live' : state === 'offline' ? 'bg-danger' : 'bg-zinc-500'

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-850 px-3 py-1.5 text-xs text-zinc-400">
      <span className={`size-1.5 rounded-full ${color}`} />
      {label}
    </span>
  )
}
