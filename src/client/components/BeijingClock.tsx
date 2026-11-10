import { useEffect, useState } from 'react'

import { shanghaiTime } from '../../shared/time.js'

export function BeijingClock({ className = '' }: { className?: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <span className={`inline-flex items-baseline gap-1.5 font-mono text-[11px] ${className}`}>
      <span className="text-zinc-400">{shanghaiTime(now)}</span>
      <span className="text-zinc-600">北京时间</span>
    </span>
  )
}
