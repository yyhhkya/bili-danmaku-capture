import { ArrowsClockwise, Trash, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import type { RoomSummary } from '../../shared/types.js'
import { connectionLabel, liveLabel } from '../lib/format.js'

interface Props {
  room: RoomSummary
  onReconnect: () => Promise<void>
  onRemove: () => Promise<void>
}

const TONE_CLASS: Record<string, string> = {
  live: 'border-live/25 bg-live/10 text-live',
  warn: 'border-warn/25 bg-warn/10 text-warn',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  muted: 'border-line bg-ink-850 text-zinc-500',
}

const DOT_CLASS: Record<string, string> = {
  live: 'bg-live',
  warn: 'bg-warn',
  danger: 'bg-danger',
  muted: 'bg-zinc-600',
}

function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] ${TONE_CLASS[tone] ?? TONE_CLASS.muted}`}
    >
      <span className={`size-1 rounded-full ${DOT_CLASS[tone] ?? DOT_CLASS.muted}`} />
      {label}
    </span>
  )
}

export function RoomHeader({ room, onReconnect, onRemove }: Props) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setConfirming(false)
    setError(null)
  }, [room.roomId])

  const live = liveLabel(room.liveStatus)
  const connection = connectionLabel(room.connection)

  async function handleReconnect() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onReconnect()
    } catch (err) {
      setError(err instanceof Error ? err.message : '重连失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (busy) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onRemove()
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除失败')
      setBusy(false)
    }
  }

  return (
    <section className="relative overflow-hidden border-b border-line">
      {room.cover ? (
        <img
          src={room.cover}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.07] blur-2xl"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(10,12,15,0.35), rgba(10,12,15,0.92) 70%, #0a0c0f)',
        }}
      />

      <div className="relative px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip label={live.label} tone={live.tone} />
              <Chip label={connection.label} tone={connection.tone} />
              <span className="font-mono text-[10px] text-zinc-600">ID {room.roomId}</span>
            </div>
            <h2 className="mt-2 max-w-3xl truncate text-base font-semibold tracking-tight text-zinc-100 sm:text-lg">
              {room.title}
            </h2>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {room.uname || '未知主播'}
              {room.areaName ? ` · ${room.areaName}` : ''}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleReconnect()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-ink-900/70 px-2.5 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-line-strong hover:text-zinc-100 active:scale-[0.98] disabled:opacity-50"
            >
              <ArrowsClockwise
                size={13}
                weight="regular"
                className={busy ? 'animate-spin' : undefined}
              />
              重连
            </button>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors active:scale-[0.98] disabled:opacity-50 ${
                confirming
                  ? 'border-danger/40 bg-danger/10 text-danger'
                  : 'border-line bg-ink-900/70 text-zinc-500 hover:border-danger/30 hover:text-danger'
              }`}
            >
              <Trash size={13} weight="regular" />
              {confirming ? '确认移除' : '移除'}
            </button>
          </div>
        </div>

        {error || room.lastError ? (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-danger">
            <WarningCircle size={13} weight="regular" className="mt-px shrink-0" />
            {error ?? room.lastError}
          </p>
        ) : null}
      </div>
    </section>
  )
}
