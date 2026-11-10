import { useEffect, useMemo, useState } from 'react'

import type { NormalizedEvent, RoomSummary } from '../../shared/types.js'
import { shanghaiTime } from '../../shared/time.js'
import { formatCount } from '../lib/format.js'

interface Props {
  room: RoomSummary
  events: NormalizedEvent[]
}

const BUCKETS = 30
const WINDOW_MS = 60_000

function Sparkline({ events }: { events: NormalizedEvent[] }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 2000)
    return () => window.clearInterval(timer)
  }, [])

  const counts = useMemo(() => {
    void tick
    const now = Date.now()
    const result = new Array<number>(BUCKETS).fill(0)
    for (const event of events) {
      const age = now - event.ts
      if (age < 0 || age >= WINDOW_MS) continue
      const index = BUCKETS - 1 - Math.floor(age / (WINDOW_MS / BUCKETS))
      if (index >= 0 && index < BUCKETS) result[index] = (result[index] ?? 0) + 1
    }
    return result
  }, [events, tick])

  const max = Math.max(1, ...counts)

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">60 秒</span>
        <span className="font-mono text-[10px] text-zinc-600">
          {counts.reduce((sum, value) => sum + value, 0)} 条
        </span>
      </div>
      <svg
        viewBox={`0 0 ${BUCKETS * 4} 28`}
        preserveAspectRatio="none"
        className="mt-1.5 h-7 w-full"
        aria-hidden="true"
      >
        {counts.map((count, index) => {
          const height = count === 0 ? 1 : Math.max(2, (count / max) * 28)
          return (
            <rect
              key={index}
              x={index * 4}
              y={28 - height}
              width={2.5}
              height={height}
              rx={0.8}
              fill={count === 0 ? '#2a3038' : 'var(--color-accent)'}
              opacity={count === 0 ? 0.7 : 0.9}
            />
          )
        })}
      </svg>
    </div>
  )
}

export function StatsBar({ room, events }: Props) {
  const metrics = [
    { label: '在线', value: formatCount(room.online) },
    { label: '人气', value: formatCount(room.popularity) },
    { label: '弹幕 / 分', value: String(room.messageRate) },
    {
      label: '最后消息',
      value: room.lastEventAt ? shanghaiTime(room.lastEventAt) : '—',
    },
  ]

  return (
    <div className="flex shrink-0 items-stretch border-b border-line">
      <div className="grid flex-1 grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        {metrics.map((metric) => (
          <div key={metric.label} className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{metric.label}</p>
            <p className="mt-1 font-mono text-base text-zinc-200">{metric.value}</p>
          </div>
        ))}
      </div>
      <div className="hidden w-44 shrink-0 border-l border-line px-4 py-3 md:block">
        <Sparkline events={events} />
      </div>
    </div>
  )
}
