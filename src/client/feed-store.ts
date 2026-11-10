import type { NormalizedEvent } from '../shared/types.js'

const MAX_EVENTS = 1000
const MAX_IDS = 2500

class LiveFeedStore {
  private readonly rooms = new Map<number, NormalizedEvent[]>()
  private readonly ids = new Map<number, Set<string>>()
  private readonly listeners = new Set<() => void>()
  private readonly empty: NormalizedEvent[] = []

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = (roomId: number | null): NormalizedEvent[] => {
    if (roomId === null) return this.empty
    return this.rooms.get(roomId) ?? this.empty
  }

  ingest(roomId: number, events: NormalizedEvent[]): void {
    if (events.length === 0) return
    const current = this.rooms.get(roomId) ?? []
    const seen = this.ids.get(roomId) ?? new Set<string>()
    const next = current.slice()

    for (const event of events) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      next.push(event)
    }

    while (seen.size > MAX_IDS) {
      const oldest = seen.values().next().value
      if (oldest === undefined) break
      seen.delete(oldest)
    }

    const trimmed = next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next
    this.rooms.set(roomId, trimmed)
    this.ids.set(roomId, seen)
    this.notify()
  }

  /** 历史回填：与实时事件按时间合并、去重，避免丢掉加载期间的新消息。 */
  merge(roomId: number, history: NormalizedEvent[]): void {
    if (history.length === 0) return
    const current = this.rooms.get(roomId) ?? []
    const seen = this.ids.get(roomId) ?? new Set<string>()
    const next = current.slice()

    for (const event of history) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      next.push(event)
    }

    next.sort((a, b) => a.ts - b.ts)
    const trimmed = next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next
    this.rooms.set(roomId, trimmed)
    this.ids.set(roomId, seen)
    this.notify()
  }

  clear(roomId: number): void {
    this.rooms.delete(roomId)
    this.ids.delete(roomId)
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

export const feedStore = new LiveFeedStore()
