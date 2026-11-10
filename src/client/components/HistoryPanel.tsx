import { CalendarBlank, CaretDown, DownloadSimple } from '@phosphor-icons/react'

import { formatBytes } from '../lib/format.js'

interface Props {
  dates: Array<{ date: string; size: number }>
  date: string
  onChange: (date: string) => void
  loading: boolean
  count: number
  exportUrl: string
}

export function HistoryPanel({ dates, date, onChange, loading, count, exportUrl }: Props) {
  const hasDate = dates.some((item) => item.date === date)
  const options = hasDate || dates.length === 0 ? dates : [{ date, size: 0 }, ...dates]

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
        <CalendarBlank size={13} weight="regular" />
        记录日期
      </span>

      <div className="relative">
        <select
          value={date}
          onChange={(event) => onChange(event.target.value)}
          disabled={options.length === 0}
          aria-label="选择记录日期"
          className="h-7 appearance-none rounded-md border border-line bg-ink-850 pl-2 pr-7 font-mono text-[11px] text-zinc-300 focus:border-accent focus:outline-none disabled:opacity-50"
        >
          {options.length === 0 ? <option value={date}>暂无记录</option> : null}
          {options.map((item) => (
            <option key={item.date} value={item.date}>
              {item.date}
              {item.size > 0 ? ` · ${formatBytes(item.size)}` : ''}
            </option>
          ))}
        </select>
        <CaretDown
          size={11}
          weight="bold"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
        />
      </div>

      <span className="font-mono text-[10px] text-zinc-600">
        {loading ? '读取中' : `${count} 条`}
      </span>

      <a
        href={exportUrl}
        className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[11px] text-zinc-400 transition-colors hover:border-line-strong hover:text-zinc-100"
      >
        <DownloadSimple size={12} weight="regular" />
        导出该日 CSV
      </a>
    </div>
  )
}
