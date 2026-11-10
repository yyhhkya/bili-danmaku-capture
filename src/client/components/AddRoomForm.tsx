import { Plus } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'

import { ApiError } from '../api.js'

interface Props {
  onAdd: (input: string) => Promise<void>
}

export function AddRoomForm({ onAdd }: Props) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = value.trim()
    if (!input || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onAdd(input)
      setValue('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '添加直播间失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 pb-3 pt-4">
      <div className="flex items-center gap-2">
        <label htmlFor="add-room-input" className="sr-only">
          房间号或直播间链接
        </label>
        <input
          id="add-room-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="房间号或直播间链接"
          spellCheck={false}
          autoComplete="off"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-ink-850 px-3 font-mono text-xs text-zinc-200 placeholder:font-sans placeholder:text-zinc-600 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting || value.trim().length === 0}
          aria-label="添加直播间"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-ink-950 transition-colors hover:bg-accent-strong active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} weight="bold" />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[11px] leading-relaxed text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}
