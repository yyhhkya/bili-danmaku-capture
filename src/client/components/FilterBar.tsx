import {
  ArrowDown,
  Broadcast,
  ClockCounterClockwise,
  DownloadSimple,
  MagnifyingGlass,
  Pause,
  Play,
  Trash,
} from '@phosphor-icons/react'

import type { EventType } from '../../shared/types.js'

interface Props {
  activeTypes: Set<EventType>
  counts: Record<EventType, number>
  onToggleType: (type: EventType) => void
  onSelectAll: () => void
  keyword: string
  onKeywordChange: (value: string) => void
  paused: boolean
  unseen: number
  onTogglePause: () => void
  pauseDisabled?: boolean
  view: 'live' | 'history'
  onViewChange: (view: 'live' | 'history') => void
  onClear: () => void
  exportUrl: string
}

const TYPES: Array<{ key: EventType; label: string }> = [
  { key: 'danmaku', label: '弹幕' },
  { key: 'superchat', label: '醒目留言' },
  { key: 'gift', label: '礼物' },
  { key: 'guard', label: '上舰' },
  { key: 'enter', label: '进场' },
  { key: 'follow', label: '关注' },
]

export function FilterBar({
  activeTypes,
  counts,
  onToggleType,
  onSelectAll,
  keyword,
  onKeywordChange,
  paused,
  unseen,
  onTogglePause,
  pauseDisabled = false,
  view,
  onViewChange,
  onClear,
  exportUrl,
}: Props) {
  const allActive = activeTypes.size === TYPES.length

  return (
    <div className="shrink-0 border-b border-line px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onSelectAll}
            className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
              allActive
                ? 'border-accent/40 bg-accent-soft text-accent'
                : 'border-line text-zinc-500 hover:border-line-strong hover:text-zinc-300'
            }`}
          >
            全部
          </button>
          {TYPES.map((type) => {
            const active = activeTypes.has(type.key)
            return (
              <button
                key={type.key}
                type="button"
                onClick={() => onToggleType(type.key)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  active
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : 'border-line text-zinc-500 hover:border-line-strong hover:text-zinc-300'
                }`}
              >
                {type.label}
                <span className="font-mono text-[10px] opacity-60">{counts[type.key]}</span>
              </button>
            )
          })}
        </div>

        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          <div className="relative min-w-0 basis-full sm:basis-auto">
            <MagnifyingGlass
              size={13}
              weight="regular"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600"
            />
            <input
              value={keyword}
              onChange={(event) => onKeywordChange(event.target.value)}
              placeholder="筛选内容或用户"
              aria-label="筛选内容或用户"
              className="h-8 w-full rounded-md border border-line bg-ink-850 pl-7 pr-2 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-accent focus:outline-none sm:w-44"
            />
          </div>

          <button
            type="button"
            onClick={onTogglePause}
            aria-pressed={paused}
            disabled={pauseDisabled}
            title={pauseDisabled ? '历史视图不支持暂停' : undefined}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              paused
                ? 'border-warn/40 bg-warn/10 text-warn'
                : 'border-line text-zinc-400 hover:border-line-strong hover:text-zinc-100'
            }`}
          >
            {paused ? <Play size={12} weight="fill" /> : <Pause size={12} weight="fill" />}
            {paused ? (unseen > 0 ? `继续 ${unseen}` : '继续') : '暂停'}
          </button>

          <div className="flex h-8 shrink-0 overflow-hidden rounded-md border border-line">
            <button
              type="button"
              onClick={() => onViewChange('live')}
              className={`inline-flex items-center gap-1 whitespace-nowrap px-2 text-[11px] transition-colors ${
                view === 'live' ? 'bg-accent-soft text-accent' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Broadcast size={12} weight="regular" />
              实时
            </button>
            <button
              type="button"
              onClick={() => onViewChange('history')}
              className={`inline-flex items-center gap-1 whitespace-nowrap border-l border-line px-2 text-[11px] transition-colors ${
                view === 'history'
                  ? 'bg-accent-soft text-accent'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <ClockCounterClockwise size={12} weight="regular" />
              历史
            </button>
          </div>

          <a
            href={exportUrl}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-line px-2 text-[11px] text-zinc-400 transition-colors hover:border-line-strong hover:text-zinc-100"
            title="导出 CSV"
          >
            <DownloadSimple size={12} weight="regular" />
            <span className="hidden sm:inline">导出</span>
          </a>

          <button
            type="button"
            onClick={onClear}
            aria-label="清空当前视图"
            title="清空当前视图"
            className="grid size-8 shrink-0 place-items-center rounded-md border border-line text-zinc-600 transition-colors hover:border-line-strong hover:text-zinc-300"
          >
            <Trash size={13} weight="regular" />
          </button>
        </div>
      </div>

      {allActive ? null : (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-600">
          <ArrowDown size={10} weight="bold" className="rotate-180" />
          已按类型筛选，共 {activeTypes.size} 类
        </p>
      )}
    </div>
  )
}
