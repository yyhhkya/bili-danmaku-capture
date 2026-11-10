import path from 'node:path'
import type { Response } from 'express'

import type { EventEmoticon, NormalizedEvent, RoomSummary } from '../../shared/types.js'
import { shanghaiDateKey } from '../../shared/time.js'
import type { BiliAccount } from '../bili/account.js'
import {
  fetchRecentEmoticons,
  fetchRoomEmoticonPackages,
  fillEventEmoticons,
} from '../bili/emoticons.js'
import type { BiliHttp } from '../bili/http.js'
import { LiveDanmakuClient } from '../bili/live-client.js'
import {
  fetchAnchorInfo,
  fetchDanmuEndpoint,
  fetchRoomInfo,
  type AnchorInfo,
  type RoomInfo,
} from '../bili/room.js'
import type { AppConfig } from '../config.js'
import type { Logger } from '../logger.js'
import { EmoteStore } from './emote-store.js'
import { JsonlStore, RoomRepository, type StoredRoom } from './store.js'

const PACKAGE_REFRESH_MS = 15 * 60_000
const EMOTE_TOKEN_PATTERN = /\[[^[\]]{1,64}\]/g

export type RoomErrorCode = 'INVALID_ROOM' | 'ROOM_LIMIT' | 'ROOM_EXISTS' | 'ROOM_NOT_FOUND'

export class RoomError extends Error {
  constructor(
    readonly code: RoomErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RoomError'
  }
}

interface Runtime {
  summary: RoomSummary
  client: LiveDanmakuClient
  store: JsonlStore
  subscribers: Set<(events: NormalizedEvent[]) => void>
  pending: NormalizedEvent[]
  flushTimer: NodeJS.Timeout | null
  eventTimes: number[]
  emoticons: Record<string, EventEmoticon>
  emoticonPromise: Promise<void> | null
  emoticonPackageAt: number
  emoticonSaveTimer: NodeJS.Timeout | null
}

export interface RoomManagerDeps {
  config: AppConfig
  http: BiliHttp
  account: BiliAccount
  logger: Logger
  onAuthFailure?: () => void
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class RoomManager {
  private readonly rooms = new Map<number, Runtime>()
  private readonly statusSubscribers = new Set<(rooms: RoomSummary[]) => void>()
  private readonly repo: RoomRepository
  private readonly emoteStore: EmoteStore
  private pollTimer: NodeJS.Timeout | null = null
  private statusTimer: NodeJS.Timeout | null = null
  private initialized = false

  constructor(private readonly deps: RoomManagerDeps) {
    this.repo = new RoomRepository(deps.config.dataDir, deps.logger)
    this.emoteStore = new EmoteStore(deps.config.dataDir, deps.logger)
  }

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    const stored = await this.repo.load()
    for (const item of stored) {
      try {
        await this.restoreRoom(item)
      } catch (error) {
        this.deps.logger.warn('恢复房间失败', {
          roomId: item.realRoomId,
          reason: error instanceof Error ? error.message : '未知错误',
        })
      }
      await delay(250)
    }
    if (stored.length > 0) {
      this.deps.logger.info('已恢复监控房间', { count: this.rooms.size })
    }
    this.pollTimer = setInterval(() => void this.refreshRooms(), 60_000)
    this.pollTimer.unref()
  }

  private async restoreRoom(item: StoredRoom): Promise<void> {
    const summary = await this.buildSummary(item.inputRoomId, item.realRoomId, {
      title: item.title,
      uname: item.uname,
      addedAt: item.addedAt,
    })
    this.createRuntime(summary)
  }

  private async buildSummary(
    inputRoomId: number,
    realRoomId: number,
    fallback?: { title?: string; uname?: string; addedAt?: number },
    knownInfo?: RoomInfo,
  ): Promise<RoomSummary> {
    let info: RoomInfo | null = knownInfo ?? null
    if (!info) {
      try {
        info = await fetchRoomInfo(this.deps.http, inputRoomId)
      } catch (error) {
        if (!fallback) throw error
        this.deps.logger.warn('刷新房间信息失败，使用缓存信息', {
          roomId: realRoomId,
          reason: error instanceof Error ? error.message : '未知错误',
        })
      }
    }

    const resolvedRealId = info?.realRoomId ?? realRoomId
    let anchor: AnchorInfo | null = null
    if (info) {
      try {
        anchor = await fetchAnchorInfo(this.deps.http, resolvedRealId)
      } catch {
        anchor = null
      }
    }

    return {
      roomId: resolvedRealId,
      inputRoomId,
      shortId: info?.shortId ?? 0,
      title: info?.title ?? fallback?.title ?? `直播间 ${resolvedRealId}`,
      uname: anchor?.uname || fallback?.uname || '',
      face: anchor?.face ?? '',
      cover: info?.cover ?? '',
      areaName: info?.areaName ?? '',
      liveStatus: info?.liveStatus ?? 0,
      onlineUsers: null,
      watched: anchor?.watched ?? null,
      connection: 'idle',
      messageRate: 0,
      addedAt: fallback?.addedAt ?? Date.now(),
      lastEventAt: null,
    }
  }

  private createRuntime(summary: RoomSummary): Runtime {
    const store = new JsonlStore(
      path.join(this.deps.config.dataDir, String(summary.roomId)),
      this.deps.logger,
    )

    let runtime!: Runtime
    const client = new LiveDanmakuClient(summary.roomId, {
      fetchEndpoint: (roomId) => fetchDanmuEndpoint(this.deps.http, roomId),
      getUid: () => this.deps.account.getUid(),
      onEvent: (event) => this.onEvent(runtime, event),
      onOnlineCount: (value) => {
        runtime.summary.onlineUsers = value
        this.scheduleStatus()
      },
      onWatched: (value) => {
        runtime.summary.watched = value
        this.scheduleStatus()
      },
      onState: (state, detail) => {
        runtime.summary.connection = state
        if (detail?.error) runtime.summary.lastError = detail.error
        else if (state === 'connected') runtime.summary.lastError = undefined
        this.scheduleStatus()
      },
      onAuthFailure: this.deps.onAuthFailure,
      logger: this.deps.logger,
    })

    runtime = {
      summary,
      client,
      store,
      subscribers: new Set(),
      pending: [],
      flushTimer: null,
      eventTimes: [],
      emoticons: {},
      emoticonPromise: null,
      emoticonPackageAt: 0,
      emoticonSaveTimer: null,
    }
    this.rooms.set(summary.roomId, runtime)
    client.start()
    void this.initEmoticons(runtime)
    this.scheduleStatus()
    return runtime
  }

  /** 先用落盘字典，再拉包级表情，最后补历史弹幕学到的 token。 */
  private async initEmoticons(runtime: Runtime): Promise<void> {
    try {
      const cached = await this.emoteStore.load(runtime.summary.roomId)
      for (const [token, info] of Object.entries(cached)) {
        if (!runtime.emoticons[token]) runtime.emoticons[token] = info
      }
    } catch {
      // 缓存读取失败不影响后续拉取
    }
    await this.refreshPackageEmoticons(runtime, true)
    await this.loadEmoticons(runtime)
  }

  private async refreshPackageEmoticons(runtime: Runtime, force = false): Promise<void> {
    const now = Date.now()
    if (!force && now - runtime.emoticonPackageAt < PACKAGE_REFRESH_MS) return
    runtime.emoticonPackageAt = now
    try {
      const map = await fetchRoomEmoticonPackages(this.deps.http, runtime.summary.roomId)
      let changed = false
      for (const [token, info] of Object.entries(map)) {
        // 包级数据会随主播更新图片，同名 token 以最新包为准。
        if (runtime.emoticons[token]?.url === info.url) continue
        runtime.emoticons[token] = info
        changed = true
      }
      if (changed) this.scheduleEmoticonSave(runtime)
    } catch (error) {
      this.deps.logger.warn('房间表情包拉取失败', {
        roomId: runtime.summary.roomId,
        reason: error instanceof Error ? error.message : '未知错误',
      })
    }
  }

  private onEvent(runtime: Runtime, event: NormalizedEvent): void {
    if (!this.needsEmoticonLookup(runtime, event)) {
      this.applyCachedEmoticons(runtime, event)
      this.recordEvent(runtime, event)
      return
    }
    void (async () => {
      try {
        await this.resolveEventEmoticons(runtime, event)
      } catch {
        // 补齐失败时保留纯文本
      }
      this.recordEvent(runtime, event)
    })()
  }

  private needsEmoticonLookup(runtime: Runtime, event: NormalizedEvent): boolean {
    if (event.type !== 'danmaku') return false
    if (!event.emoticonUnique) return false
    const tokens = event.text.match(EMOTE_TOKEN_PATTERN) ?? []
    if (tokens.some((token) => !event.emoticons?.[token] && !runtime.emoticons[token])) return true
    if (tokens.length > 0) return false
    // 纯表情消息的正文没有方括号，按字典里的裸名字判断是否已知。
    const bareText = event.text.trim()
    return !Object.keys(runtime.emoticons).some((token) => {
      const bare = token.slice(1, -1)
      return bare !== '' && bareText === bare && !event.emoticons?.[bare]
    })
  }

  private applyCachedEmoticons(runtime: Runtime, event: NormalizedEvent): boolean {
    return fillEventEmoticons(event, runtime.emoticons)
  }

  private async resolveEventEmoticons(runtime: Runtime, event: NormalizedEvent): Promise<void> {
    await this.refreshPackageEmoticons(runtime)
    if (this.applyCachedEmoticons(runtime, event)) return
    await this.loadEmoticons(runtime)
    if (this.applyCachedEmoticons(runtime, event)) return
    // 历史接口可能比 WebSocket 晚一拍，稍后再试一次。
    await delay(700)
    await this.loadEmoticons(runtime, true)
    this.applyCachedEmoticons(runtime, event)
  }

  private loadEmoticons(runtime: Runtime, force = false): Promise<void> {
    if (!force && runtime.emoticonPromise) return runtime.emoticonPromise

    let promise: Promise<void>
    promise = fetchRecentEmoticons(this.deps.http, runtime.summary.roomId)
      .then((map) => {
        if (Object.keys(map).length === 0) return
        Object.assign(runtime.emoticons, map)
        this.scheduleEmoticonSave(runtime)
      })
      .catch(() => undefined)
      .finally(() => {
        if (runtime.emoticonPromise === promise) runtime.emoticonPromise = null
      })
    runtime.emoticonPromise = promise
    return promise
  }

  private scheduleEmoticonSave(runtime: Runtime): void {
    if (runtime.emoticonSaveTimer) return
    runtime.emoticonSaveTimer = setTimeout(() => {
      runtime.emoticonSaveTimer = null
      void this.flushEmoticonSave(runtime)
    }, 2000)
    runtime.emoticonSaveTimer.unref()
  }

  private async flushEmoticonSave(runtime: Runtime): Promise<void> {
    if (Object.keys(runtime.emoticons).length === 0) return
    try {
      await this.emoteStore.save(runtime.summary.roomId, runtime.emoticons)
    } catch (error) {
      this.deps.logger.warn('表情缓存保存失败', {
        roomId: runtime.summary.roomId,
        reason: error instanceof Error ? error.message : '未知错误',
      })
    }
  }

  private recordEvent(runtime: Runtime, event: NormalizedEvent): void {
    runtime.summary.lastEventAt = event.receivedAt
    runtime.eventTimes.push(event.receivedAt)
    const cutoff = Date.now() - 60_000
    while (runtime.eventTimes.length > 0 && (runtime.eventTimes[0] as number) < cutoff) {
      runtime.eventTimes.shift()
    }

    runtime.store.append(event)
    runtime.pending.push(event)

    if (!runtime.flushTimer) {
      runtime.flushTimer = setTimeout(() => {
        runtime.flushTimer = null
        const batch = runtime.pending.splice(0)
        for (const subscriber of runtime.subscribers) subscriber(batch)
      }, 100)
      runtime.flushTimer.unref()
    }
    this.scheduleStatus()
  }

  private toSummary(runtime: Runtime): RoomSummary {
    const cutoff = Date.now() - 60_000
    while (runtime.eventTimes.length > 0 && (runtime.eventTimes[0] as number) < cutoff) {
      runtime.eventTimes.shift()
    }
    return { ...runtime.summary, messageRate: runtime.eventTimes.length }
  }

  list(): RoomSummary[] {
    return [...this.rooms.values()]
      .map((runtime) => this.toSummary(runtime))
      .sort((a, b) => a.addedAt - b.addedAt)
  }

  get(roomId: number): RoomSummary | undefined {
    const runtime = this.rooms.get(roomId)
    return runtime ? this.toSummary(runtime) : undefined
  }

  async add(inputRoomId: number): Promise<RoomSummary> {
    if (this.rooms.size >= this.deps.config.maxRooms) {
      throw new RoomError('ROOM_LIMIT', `最多同时监控 ${this.deps.config.maxRooms} 个直播间`)
    }

    const info = await fetchRoomInfo(this.deps.http, inputRoomId)
    if (this.rooms.has(info.realRoomId)) {
      throw new RoomError('ROOM_EXISTS', '该直播间已在监控列表中')
    }

    const summary = await this.buildSummary(inputRoomId, info.realRoomId, undefined, info)
    this.createRuntime(summary)
    await this.persist()
    this.scheduleStatus()
    return this.toSummary(this.rooms.get(summary.roomId) as Runtime)
  }

  async remove(roomId: number): Promise<boolean> {
    const runtime = this.rooms.get(roomId)
    if (!runtime) return false
    runtime.client.stop()
    if (runtime.flushTimer) clearTimeout(runtime.flushTimer)
    if (runtime.emoticonSaveTimer) clearTimeout(runtime.emoticonSaveTimer)
    runtime.flushTimer = null
    runtime.emoticonSaveTimer = null
    runtime.pending = []
    await this.flushEmoticonSave(runtime)
    await runtime.store.close()
    this.rooms.delete(roomId)
    await this.persist()
    this.scheduleStatus()
    return true
  }

  reconnect(roomId: number): void {
    const runtime = this.rooms.get(roomId)
    if (!runtime) throw new RoomError('ROOM_NOT_FOUND', '直播间不在监控列表中')
    runtime.client.reconnectNow()
  }

  subscribe(roomId: number, listener: (events: NormalizedEvent[]) => void): () => void {
    const runtime = this.rooms.get(roomId)
    if (!runtime) return () => undefined
    runtime.subscribers.add(listener)
    return () => runtime.subscribers.delete(listener)
  }

  subscribeStatus(listener: (rooms: RoomSummary[]) => void): () => void {
    this.statusSubscribers.add(listener)
    return () => this.statusSubscribers.delete(listener)
  }

  async history(
    roomId: number,
    date = shanghaiDateKey(),
    limit = 200,
  ): Promise<NormalizedEvent[]> {
    const runtime = this.rooms.get(roomId)
    if (!runtime) throw new RoomError('ROOM_NOT_FOUND', '直播间不在监控列表中')
    const events = await runtime.store.readRecent(date, Math.min(Math.max(limit, 1), 500))
    // 落盘时未解析的表情，用当前字典补齐后再回给前端。
    for (const event of events) fillEventEmoticons(event, runtime.emoticons)
    return events
  }

  async dates(roomId: number): Promise<Array<{ date: string; size: number }>> {
    const runtime = this.rooms.get(roomId)
    if (!runtime) throw new RoomError('ROOM_NOT_FOUND', '直播间不在监控列表中')
    return runtime.store.listDates()
  }

  async exportCsv(roomId: number, date: string, res: Response): Promise<void> {
    const runtime = this.rooms.get(roomId)
    if (!runtime) throw new RoomError('ROOM_NOT_FOUND', '直播间不在监控列表中')
    await runtime.store.streamCsv(date, res)
  }

  private scheduleStatus(): void {
    if (this.statusTimer) return
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null
      const list = this.list()
      for (const subscriber of this.statusSubscribers) subscriber(list)
    }, 300)
    this.statusTimer.unref()
  }

  private async refreshRooms(): Promise<void> {
    for (const runtime of this.rooms.values()) {
      try {
        const info = await fetchRoomInfo(this.deps.http, runtime.summary.inputRoomId)
        runtime.summary.title = info.title
        runtime.summary.liveStatus = info.liveStatus
        runtime.summary.cover = info.cover
        runtime.summary.areaName = info.areaName
        runtime.summary.shortId = info.shortId
        if (!runtime.summary.uname) {
          const anchor = await fetchAnchorInfo(this.deps.http, info.realRoomId)
          if (anchor) {
            runtime.summary.uname = anchor.uname
            runtime.summary.face = anchor.face
            if (runtime.summary.watched === null && anchor.watched !== null) {
              runtime.summary.watched = anchor.watched
            }
          }
        }
        void this.refreshPackageEmoticons(runtime)
        void this.loadEmoticons(runtime, true)
      } catch {
        // 单房间刷新失败不影响其他房间
      }
    }
    this.scheduleStatus()
  }

  private async persist(): Promise<void> {
    const stored: StoredRoom[] = [...this.rooms.values()].map((runtime) => ({
      inputRoomId: runtime.summary.inputRoomId,
      realRoomId: runtime.summary.roomId,
      title: runtime.summary.title,
      uname: runtime.summary.uname,
      addedAt: runtime.summary.addedAt,
    }))
    try {
      await this.repo.save(stored)
    } catch (error) {
      this.deps.logger.warn('保存房间配置失败', {
        reason: error instanceof Error ? error.message : '未知错误',
      })
    }
  }

  async shutdown(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.statusTimer) clearTimeout(this.statusTimer)
    this.pollTimer = null
    this.statusTimer = null

    const runtimes = [...this.rooms.values()]
    for (const runtime of runtimes) {
      runtime.client.stop()
      if (runtime.flushTimer) clearTimeout(runtime.flushTimer)
      if (runtime.emoticonSaveTimer) clearTimeout(runtime.emoticonSaveTimer)
      runtime.flushTimer = null
      runtime.emoticonSaveTimer = null
    }
    await Promise.all([
      ...runtimes.map((runtime) => runtime.store.close()),
      ...runtimes.map((runtime) => this.flushEmoticonSave(runtime)),
    ])
    this.rooms.clear()
  }
}
