import { ArrowDown, Broadcast, ClockCounterClockwise } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { NormalizedEvent } from '../../shared/types.js'
import { EventItem } from './EventItem.js'

interface Props {
  roomId: number | null
  view: 'live' | 'history'
  events: NormalizedEvent[]
  paused: boolean
  unseen: number
  onResume: () => void
  historyLoading: boolean
  resetKey: string
  hasMore: boolean
  loadingEarlier: boolean
  onLoadEarlier: () => void
}

function FeedSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="flex gap-3">
          <div className="h-3 w-12 animate-pulse rounded bg-ink-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-24 animate-pulse rounded bg-ink-800" />
            <div
              className="h-3 animate-pulse rounded bg-ink-800"
              style={{ width: `${45 + ((index * 13) % 40)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EventFeed({
  roomId,
  view,
  events,
  paused,
  unseen,
  onResume,
  historyLoading,
  resetKey,
  hasMore,
  loadingEarlier,
  onLoadEarlier,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const pendingScrollRef = useRef<{ height: number; top: number } | null>(null)

  useEffect(() => {
    setAutoScroll(true)
    pendingScrollRef.current = null
  }, [resetKey])

  useLayoutEffect(() => {
    if (!autoScroll || paused) return
    const element = containerRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [events, autoScroll, paused, resetKey])

  // 顶部补页后保持视口位置，避免内容跳动到新加载的片段。
  useLayoutEffect(() => {
    const element = containerRef.current
    const pending = pendingScrollRef.current
    if (!element || !pending || loadingEarlier) return
    const delta = element.scrollHeight - pending.height
    if (delta > 0) element.scrollTop = pending.top + delta
    pendingScrollRef.current = null
  }, [events, loadingEarlier])

  function handleScroll() {
    const element = containerRef.current
    if (!element) return
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80
    setAutoScroll(nearBottom)
    if (element.scrollTop < 120 && hasMore && !loadingEarlier) {
      pendingScrollRef.current = { height: element.scrollHeight, top: element.scrollTop }
      onLoadEarlier()
    }
  }

  function scrollToBottom() {
    setAutoScroll(true)
    const element = containerRef.current
    if (element) element.scrollTop = element.scrollHeight
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        role="log"
        aria-live="off"
        aria-label="弹幕事件流"
        className="feed-scroll h-full overflow-y-auto"
      >
        {paused ? (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-warn/20 bg-ink-950/90 px-4 py-2 text-[11px] text-warn backdrop-blur">
            <span>已暂停 · {unseen} 条新事件</span>
            <button
              type="button"
              onClick={onResume}
              className="rounded border border-warn/30 px-2 py-0.5 text-[10px] transition-colors hover:bg-warn/10"
            >
              继续
            </button>
          </div>
        ) : null}

        {!historyLoading && events.length > 0 ? (
          <div className="border-b border-line/60 px-4 py-2 text-center text-[11px] text-zinc-600">
            {loadingEarlier
              ? '正在加载更早的事件…'
              : hasMore
                ? '继续向上滚动加载更早的事件'
                : '已到当天最早一条'}
          </div>
        ) : null}

        {historyLoading ? (
          <FeedSkeleton />
        ) : events.length === 0 ? (
          <div className="grid h-full place-items-center px-6 py-16">
            <div className="max-w-sm text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-full border border-line bg-ink-850 text-zinc-600">
                {view === 'history' ? (
                  <ClockCounterClockwise size={19} weight="regular" />
                ) : (
                  <Broadcast size={19} weight="regular" />
                )}
              </span>
              <p className="mt-3 text-sm text-zinc-400">
                {view === 'history' ? '这一天还没有落盘记录' : '等待第一条事件'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                {view === 'history'
                  ? '切换日期，或回到实时视图继续接收。'
                  : roomId
                    ? '连接建立后，弹幕、醒目留言与礼物会出现在这里。'
                    : '先在左侧选择或添加一个直播间。'}
              </p>
            </div>
          </div>
        ) : (
          <div>
            {events.map((event) => (
              <EventItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>

      {!autoScroll && events.length > 0 ? (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-900 px-3 py-1.5 text-[11px] text-zinc-300 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)] transition-colors hover:border-line-strong hover:text-zinc-100 active:scale-[0.98]"
        >
          <ArrowDown size={12} weight="bold" />
          回到底部
        </button>
      ) : null}
    </div>
  )
}
