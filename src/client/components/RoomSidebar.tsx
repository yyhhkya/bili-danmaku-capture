import { Broadcast, WarningCircle } from '@phosphor-icons/react'

import type { RoomSummary } from '../../shared/types.js'
import { connectionLabel, formatCount, liveLabel } from '../lib/format.js'
import { BeijingClock } from './BeijingClock.js'
import { AddRoomForm } from './AddRoomForm.js'

interface Props {
  rooms: RoomSummary[]
  selectedId: number | null
  loading: boolean
  error: string | null
  onSelect: (roomId: number) => void
  onAdd: (input: string) => Promise<void>
  onRetry: () => void
}

const DOT_CLASS: Record<string, string> = {
  live: 'bg-live',
  warn: 'bg-warn',
  danger: 'bg-danger',
  muted: 'bg-zinc-600',
}

export function RoomSidebar({
  rooms,
  selectedId,
  loading,
  error,
  onSelect,
  onAdd,
  onRetry,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          监控房间
        </h2>
        <span className="font-mono text-[11px] text-zinc-600">{rooms.length}</span>
      </div>

      <AddRoomForm onAdd={onAdd} />

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        {loading ? (
          <div className="space-y-px p-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="space-y-2 rounded-lg p-3">
                <div className="h-3 w-3/4 animate-pulse rounded bg-ink-800" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-ink-800" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-2 p-4">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-danger">
              <WarningCircle size={15} weight="regular" className="mt-px shrink-0" />
              {error}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-line px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-line-strong hover:text-zinc-100"
            >
              重试
            </button>
          </div>
        ) : rooms.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-full border border-line bg-ink-850 text-zinc-600">
              <Broadcast size={18} weight="regular" />
            </span>
            <p className="mt-3 text-xs text-zinc-400">还没有监控的房间</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
              在上方输入房间号，或粘贴直播间链接。
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line/70">
            {rooms.map((room) => {
              const active = room.roomId === selectedId
              const live = liveLabel(room.liveStatus)
              const connection = connectionLabel(room.connection)
              return (
                <li key={room.roomId}>
                  <button
                    type="button"
                    onClick={() => onSelect(room.roomId)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full border-l-2 px-4 py-3 text-left transition-colors active:scale-[0.995] ${
                      active
                        ? 'border-accent bg-ink-850'
                        : 'border-transparent hover:border-line-strong hover:bg-ink-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[13px] font-medium text-zinc-200">
                        {room.title}
                      </span>
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${DOT_CLASS[live.tone]}`}
                        title={live.label}
                      />
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {room.uname || '未知主播'}
                      {room.areaName ? ` · ${room.areaName}` : ''}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2.5 font-mono text-[10px] text-zinc-600">
                      <span className={live.tone === 'live' ? 'text-live' : undefined}>
                        {live.label}
                      </span>
                      <span>{formatCount(room.online)} 在线</span>
                      <span>{room.messageRate}/分</span>
                      <span className={connection.tone === 'danger' ? 'text-danger' : undefined}>
                        {connection.label}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <BeijingClock />
        <span className="font-mono text-[10px] text-zinc-600">JSONL</span>
      </div>
    </div>
  )
}
