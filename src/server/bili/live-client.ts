import WebSocket, { type RawData } from 'ws'

import type { NormalizedEvent, RoomConnectionState } from '../../shared/types.js'
import type { Logger } from '../logger.js'
import { normalizeMessage } from './events.js'
import { BILI_UA } from './http.js'
import { encodePacket, parsePackets, readPopularity } from './packet.js'
import type { DanmuEndpoint } from './room.js'

export interface LiveClientDeps {
  fetchEndpoint: (roomId: number) => Promise<DanmuEndpoint>
  getUid: () => number
  onEvent: (event: NormalizedEvent) => void
  onPopularity: (value: number) => void
  onState: (state: RoomConnectionState, detail?: { error?: string }) => void
  onAuthFailure?: () => void
  logger: Logger
  createSocket?: (url: string) => WebSocket
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data as ArrayBuffer)
}

export class LiveDanmakuClient {
  private stopped = true
  private generation = 0
  private state: RoomConnectionState = 'idle'
  private socket: WebSocket | null = null
  private accumulator: Buffer = Buffer.alloc(0)
  private token = ''
  private attempt = 0
  private lastPacketAt = 0
  private heartbeatTimer: NodeJS.Timeout | null = null
  private watchdogTimer: NodeJS.Timeout | null = null
  private authTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly roomId: number,
    private readonly deps: LiveClientDeps,
  ) {}

  getState(): RoomConnectionState {
    return this.state
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    this.generation += 1
    this.clearTimers()
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.removeAllListeners()
      try {
        socket.terminate()
      } catch {
        // 已关闭
      }
    }
    this.setState('closed')
  }

  reconnectNow(): void {
    this.generation += 1
    this.clearTimers()
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.removeAllListeners()
      try {
        socket.terminate()
      } catch {
        // 已关闭
      }
    }
    this.stopped = false
    void this.connect()
  }

  private setState(state: RoomConnectionState, detail?: { error?: string }): void {
    this.state = state
    this.deps.onState(state, detail)
  }

  private clearTimers(): void {
    for (const timer of [
      this.heartbeatTimer,
      this.watchdogTimer,
      this.authTimer,
      this.reconnectTimer,
    ]) {
      if (timer) clearTimeout(timer)
    }
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.watchdogTimer) clearInterval(this.watchdogTimer)
    this.heartbeatTimer = null
    this.watchdogTimer = null
    this.authTimer = null
    this.reconnectTimer = null
  }

  private scheduleReconnect(reason?: string): void {
    if (this.stopped) return
    this.attempt += 1
    const base = Math.min(30_000, 1000 * Math.pow(1.8, Math.min(this.attempt, 10)))
    const delay = Math.round(base * (0.8 + Math.random() * 0.4))
    this.setState('reconnecting', reason ? { error: reason } : undefined)
    this.reconnectTimer = setTimeout(() => void this.connect(), delay)
    this.reconnectTimer.unref()
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    const generation = ++this.generation
    this.setState('resolving')

    let endpoint: DanmuEndpoint
    try {
      endpoint = await this.deps.fetchEndpoint(this.roomId)
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取弹幕服务器失败'
      this.deps.logger.warn('获取弹幕服务器失败', { roomId: this.roomId, reason: message })
      this.scheduleReconnect(message)
      return
    }
    if (this.stopped || generation !== this.generation) return

    this.token = endpoint.token
    const host = endpoint.hosts[Math.floor(Math.random() * endpoint.hosts.length)]
    if (!host) {
      this.scheduleReconnect('弹幕服务器列表为空')
      return
    }
    const url = `wss://${host.host}:${host.wssPort}/sub`
    this.setState('connecting')

    let socket: WebSocket
    try {
      socket = this.deps.createSocket
        ? this.deps.createSocket(url)
        : new WebSocket(url, {
            handshakeTimeout: 10_000,
            headers: {
              'User-Agent': BILI_UA,
              Origin: 'https://live.bilibili.com',
            },
          })
    } catch (error) {
      this.scheduleReconnect(error instanceof Error ? error.message : '创建连接失败')
      return
    }

    this.socket = socket
    this.accumulator = Buffer.alloc(0)
    this.lastPacketAt = Date.now()

    socket.on('open', () => {
      if (generation !== this.generation) return
      this.setState('authenticating')
      const body = JSON.stringify({
        uid: this.deps.getUid(),
        roomid: this.roomId,
        protover: 3,
        platform: 'web',
        type: 2,
        key: this.token,
      })
      socket.send(encodePacket(7, body))
      this.authTimer = setTimeout(() => {
        if (generation !== this.generation) return
        this.deps.logger.warn('弹幕连接认证超时', { roomId: this.roomId })
        socket.terminate()
      }, 5000)
      this.authTimer.unref()
    })

    socket.on('message', (data) => {
      if (generation !== this.generation) return
      this.handleData(toBuffer(data), generation)
    })

    socket.on('close', (code) => {
      if (generation !== this.generation) return
      this.clearTimers()
      this.socket = null
      if (!this.stopped) this.scheduleReconnect(`连接关闭（${code}）`)
    })

    socket.on('error', (error) => {
      if (generation !== this.generation) return
      this.deps.logger.warn('弹幕连接错误', { roomId: this.roomId, reason: error.message })
    })
  }

  private handleData(data: Buffer, generation: number): void {
    this.lastPacketAt = Date.now()
    this.accumulator = Buffer.concat([this.accumulator, data])

    let parsed: ReturnType<typeof parsePackets>
    try {
      parsed = parsePackets(this.accumulator)
    } catch (error) {
      this.accumulator = Buffer.alloc(0)
      this.deps.logger.warn('弹幕封包解析失败', {
        roomId: this.roomId,
        reason: error instanceof Error ? error.message : '未知错误',
      })
      return
    }
    this.accumulator = parsed.rest

    for (const packet of parsed.packets) {
      if (generation !== this.generation) return

      if (packet.op === 8) {
        try {
          const reply = JSON.parse(packet.body.toString('utf8')) as { code?: number }
          if (reply.code === 0) {
            this.attempt = 0
            if (this.authTimer) clearTimeout(this.authTimer)
            this.authTimer = null
            this.setState('connected')
            this.startHeartbeat()
            this.startWatchdog()
          } else {
            this.deps.logger.warn('弹幕认证失败', { roomId: this.roomId, code: reply.code })
            this.deps.onAuthFailure?.()
            this.socket?.terminate()
          }
        } catch {
          this.deps.logger.warn('弹幕认证回复无法解析', { roomId: this.roomId })
        }
        continue
      }

      if (packet.op === 3) {
        const popularity = readPopularity(packet)
        if (popularity !== null) this.deps.onPopularity(popularity)
        continue
      }

      if (packet.op === 5) {
        let payload: unknown
        try {
          payload = JSON.parse(packet.body.toString('utf8'))
        } catch {
          continue
        }
        const event = normalizeMessage(payload, {
          roomId: this.roomId,
          receivedAt: Date.now(),
        })
        if (event) this.deps.onEvent(event)
      }
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(encodePacket(2, '[object Object]'))
      }
    }, 25_000)
    this.heartbeatTimer.unref()
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer)
    this.watchdogTimer = setInterval(() => {
      if (Date.now() - this.lastPacketAt > 90_000) {
        this.deps.logger.warn('弹幕连接长时间无数据，准备重连', { roomId: this.roomId })
        this.socket?.terminate()
      }
    }, 10_000)
    this.watchdogTimer.unref()
  }
}
