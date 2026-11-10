import { Broadcast, List, SignOut, X } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { EventType, RoomSummary } from '../../shared/types.js'
import { shanghaiDateKey } from '../../shared/time.js'
import {
  addRoom as addRoomApi,
  exportHref,
  fetchDates,
  fetchHistory,
  fetchRooms,
  reconnectRoom,
  removeRoom,
} from '../api.js'
import { BiliAccountPanel } from '../components/BiliAccountPanel.js'
import { BeijingClock } from '../components/BeijingClock.js'
import { EventFeed } from '../components/EventFeed.js'
import { FilterBar } from '../components/FilterBar.js'
import { HistoryPanel } from '../components/HistoryPanel.js'
import { QrLoginDialog } from '../components/QrLoginDialog.js'
import { RoomHeader } from '../components/RoomHeader.js'
import { RoomSidebar } from '../components/RoomSidebar.js'
import { StatsBar } from '../components/StatsBar.js'
import { StatusBanner } from '../components/StatusBanner.js'
import { feedStore } from '../feed-store.js'
import { useBiliAccount } from '../hooks/useBiliAccount.js'
import { useRealtime } from '../hooks/useRealtime.js'
import { useRoomFeed } from '../hooks/useRoomFeed.js'

const ALL_TYPES: EventType[] = ['danmaku', 'superchat', 'gift', 'guard', 'enter', 'follow']

interface Props {
  expiresAt: number | null
  onLogout: () => Promise<void>
}

export function DashboardPage({ expiresAt, onLogout }: Props) {
  const reduceMotion = useReducedMotion()
  const bili = useBiliAccount()
  const [qrOpen, setQrOpen] = useState(false)

  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsError, setRoomsError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [paused, setPaused] = useState(false)
  const [view, setView] = useState<'live' | 'history'>('live')
  const [activeTypes, setActiveTypes] = useState<Set<EventType>>(new Set(ALL_TYPES))
  const [keyword, setKeyword] = useState('')
  const [dates, setDates] = useState<Array<{ date: string; size: number }>>([])
  const [historyDate, setHistoryDate] = useState(() => shanghaiDateKey())
  const [historyEvents, setHistoryEvents] = useState<ReturnType<typeof feedStore.snapshot>>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.roomId === selectedId) ?? null,
    [rooms, selectedId],
  )

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true)
    try {
      const list = await fetchRooms()
      setRooms(list)
      setRoomsError(null)
      setSelectedId((previous) =>
        previous !== null && list.some((room) => room.roomId === previous)
          ? previous
          : (list[0]?.roomId ?? null),
      )
    } catch (error) {
      setRoomsError(error instanceof Error ? error.message : '无法获取房间列表')
    } finally {
      setRoomsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  const { subscribe, unsubscribe, connection } = useRealtime({
    onHello: (message) => {
      setRooms(message.rooms)
      setRoomsLoading(false)
      setSelectedId((previous) =>
        previous !== null && message.rooms.some((room) => room.roomId === previous)
          ? previous
          : (message.rooms[0]?.roomId ?? null),
      )
    },
    onStatus: (message) => {
      setRooms(message.rooms)
      setSelectedId((previous) =>
        previous !== null && message.rooms.some((room) => room.roomId === previous)
          ? previous
          : (message.rooms[0]?.roomId ?? null),
      )
    },
    onEvents: (message) => feedStore.ingest(message.roomId, message.events),
    onError: (message) => setRoomsError(message.message),
    onAuthExpired: () => window.dispatchEvent(new Event('auth-expired')),
  })

  useEffect(() => {
    if (selectedId === null) return
    subscribe(selectedId)
    return () => unsubscribe(selectedId)
  }, [selectedId, subscribe, unsubscribe])

  useEffect(() => {
    if (selectedId === null) return
    let cancelled = false
    fetchHistory(selectedId, undefined, 300)
      .then((result) => {
        if (!cancelled) feedStore.merge(selectedId, result.events)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    setPaused(false)
    setKeyword('')
    setActiveTypes(new Set(ALL_TYPES))
    setSidebarOpen(false)
  }, [selectedId])

  useEffect(() => {
    if (view !== 'history' || selectedId === null) return
    let cancelled = false
    fetchDates(selectedId)
      .then((result) => {
        if (cancelled) return
        setDates(result.dates)
        if (result.dates.length > 0) {
          const latest = result.dates[0]?.date ?? shanghaiDateKey()
          setHistoryDate((previous) =>
            result.dates.some((item) => item.date === previous) ? previous : latest,
          )
        }
      })
      .catch(() => {
        if (!cancelled) setDates([])
      })
    return () => {
      cancelled = true
    }
  }, [view, selectedId])

  useEffect(() => {
    if (view !== 'history' || selectedId === null) return
    let cancelled = false
    setHistoryLoading(true)
    fetchHistory(selectedId, historyDate, 500)
      .then((result) => {
        if (!cancelled) setHistoryEvents(result.events)
      })
      .catch(() => {
        if (!cancelled) setHistoryEvents([])
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [view, selectedId, historyDate])

  const liveFeed = useRoomFeed(selectedId, paused)
  const feedEvents = view === 'live' ? liveFeed.events : historyEvents

  const counts = useMemo(() => {
    const result: Record<EventType, number> = {
      danmaku: 0,
      superchat: 0,
      gift: 0,
      guard: 0,
      enter: 0,
      follow: 0,
    }
    for (const event of feedEvents) result[event.type] += 1
    return result
  }, [feedEvents])

  const filteredEvents = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    return feedEvents.filter(
      (event) =>
        activeTypes.has(event.type) &&
        (!needle ||
          event.text.toLowerCase().includes(needle) ||
          event.user.uname.toLowerCase().includes(needle)),
    )
  }, [feedEvents, activeTypes, keyword])

  const handleAdd = useCallback(async (input: string) => {
    const room = await addRoomApi(input)
    setRooms((previous) =>
      previous.some((item) => item.roomId === room.roomId) ? previous : [...previous, room],
    )
    setSelectedId(room.roomId)
    setSidebarOpen(false)
  }, [])

  const handleRemove = useCallback(
    async (roomId: number) => {
      await removeRoom(roomId)
      const next = rooms.filter((room) => room.roomId !== roomId)
      setRooms(next)
      feedStore.clear(roomId)
      if (selectedId === roomId) setSelectedId(next[0]?.roomId ?? null)
    },
    [rooms, selectedId],
  )

  const handleReconnect = useCallback(async (roomId: number) => {
    const updated = await reconnectRoom(roomId)
    setRooms((previous) =>
      previous.map((room) => (room.roomId === updated.roomId ? updated : room)),
    )
  }, [])

  const toggleType = useCallback((type: EventType) => {
    setActiveTypes((previous) => {
      const next = new Set(previous)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const handleViewChange = useCallback((next: 'live' | 'history') => {
    setView(next)
    setPaused(false)
  }, [])

  const handleClear = useCallback(() => {
    if (view === 'live' && selectedId !== null) feedStore.clear(selectedId)
    else setHistoryEvents([])
  }, [view, selectedId])

  const exportUrl =
    selectedRoom !== null
      ? exportHref(selectedRoom.roomId, view === 'history' ? historyDate : undefined)
      : '#'

  const resetKey = `${selectedId ?? 'none'}-${view}-${view === 'history' ? historyDate : 'live'}`
  const expiry = expiresAt
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(expiresAt)
    : null

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-ink-950">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-ink-950/85 px-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开房间列表"
            className="grid size-8 place-items-center rounded-lg border border-line text-zinc-400 transition-colors hover:border-line-strong hover:text-zinc-100 lg:hidden"
          >
            <List size={16} weight="regular" />
          </button>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent-soft text-accent">
            <Broadcast size={16} weight="regular" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight text-zinc-100">
              弹幕监控
            </p>
            <p className="hidden truncate font-mono text-[10px] text-zinc-600 sm:block">
              {selectedRoom ? selectedRoom.title : 'bili-danmaku-capture'}
            </p>
          </div>
          {connection !== 'open' ? (
            <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-warn/25 bg-warn/10 px-2 py-0.5 text-[10px] text-warn">
              <span className="size-1 rounded-full bg-warn" />
              {connection === 'connecting' ? '连接实时服务' : '实时连接断开'}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden md:inline-flex">
            <BeijingClock />
          </span>
          <BiliAccountPanel
            status={bili.status}
            loading={bili.loading}
            onQrLogin={() => setQrOpen(true)}
            onLogout={bili.logout}
            onRefreshCookie={bili.refreshCookie}
          />
          <button
            type="button"
            onClick={() => void onLogout()}
            aria-label="退出站点登录"
            title={expiry ? `会话至 ${expiry}` : '退出站点登录'}
            className="grid size-8 place-items-center rounded-lg border border-line text-zinc-500 transition-colors hover:border-line-strong hover:text-zinc-100 active:scale-[0.98]"
          >
            <SignOut size={15} weight="regular" />
          </button>
        </div>
      </header>

      <StatusBanner status={bili.status} onLogin={() => setQrOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[300px] shrink-0 flex-col border-r border-line bg-ink-950 lg:flex">
          <RoomSidebar
            rooms={rooms}
            selectedId={selectedId}
            loading={roomsLoading}
            error={roomsError}
            onSelect={setSelectedId}
            onAdd={handleAdd}
            onRetry={() => void loadRooms()}
          />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {selectedRoom ? (
            <>
              <RoomHeader
                room={selectedRoom}
                onReconnect={() => handleReconnect(selectedRoom.roomId)}
                onRemove={() => handleRemove(selectedRoom.roomId)}
              />
              <StatsBar room={selectedRoom} events={liveFeed.events} />
              <FilterBar
                activeTypes={activeTypes}
                counts={counts}
                onToggleType={toggleType}
                onSelectAll={() => setActiveTypes(new Set(ALL_TYPES))}
                keyword={keyword}
                onKeywordChange={setKeyword}
                paused={paused}
                unseen={liveFeed.unseen}
                onTogglePause={() => setPaused((value) => !value)}
                pauseDisabled={view === 'history'}
                view={view}
                onViewChange={handleViewChange}
                onClear={handleClear}
                exportUrl={exportUrl}
              />
              {view === 'history' ? (
                <HistoryPanel
                  dates={dates}
                  date={historyDate}
                  onChange={setHistoryDate}
                  loading={historyLoading}
                  count={historyEvents.length}
                  exportUrl={exportUrl}
                />
              ) : null}
              <EventFeed
                roomId={selectedId}
                view={view}
                events={filteredEvents}
                paused={paused && view === 'live'}
                unseen={liveFeed.unseen}
                onResume={() => setPaused(false)}
                historyLoading={view === 'history' && historyLoading}
                resetKey={resetKey}
              />
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-6 py-16">
              <div className="max-w-md text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-line bg-ink-850 text-accent">
                  <Broadcast size={22} weight="regular" />
                </span>
                <h2 className="mt-4 text-xl font-semibold tracking-tight text-zinc-100">
                  {roomsLoading ? '正在读取监控列表' : '选择或添加一个直播间'}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  在左侧输入房间号或粘贴 <span className="font-mono text-xs">live.bilibili.com</span> 链接，
                  实时弹幕、醒目留言与礼物会汇入这里。
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {sidebarOpen ? (
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="关闭房间列表"
              onClick={() => setSidebarOpen(false)}
              className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            />
            <motion.aside
              initial={reduceMotion ? false : { x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduceMotion ? undefined : { x: -24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              className="relative flex h-full w-[min(88vw,320px)] flex-col border-r border-line bg-ink-900"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="text-sm font-medium text-zinc-200">房间</span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="关闭"
                  className="grid size-7 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-ink-800 hover:text-zinc-200"
                >
                  <X size={15} weight="regular" />
                </button>
              </div>
              <RoomSidebar
                rooms={rooms}
                selectedId={selectedId}
                loading={roomsLoading}
                error={roomsError}
                onSelect={(roomId) => {
                  setSelectedId(roomId)
                  setSidebarOpen(false)
                }}
                onAdd={handleAdd}
                onRetry={() => void loadRooms()}
              />
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <QrLoginDialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        startQr={bili.startQr}
        pollQr={bili.pollQr}
        onAccountUpdated={bili.setStatus}
      />
    </main>
  )
}
