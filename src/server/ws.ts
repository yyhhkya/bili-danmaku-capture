import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer, type RawData } from 'ws'

import type { NormalizedEvent, RoomSummary } from '../shared/types.js'
import type { ServerMessage } from '../shared/protocol.js'
import { SESSION_COOKIE, parseCookies, verifySessionToken, type SessionPayload } from './auth.js'
import type { Logger } from './logger.js'
import type { RoomManager } from './monitor/manager.js'

interface Client {
  socket: WebSocket
  rooms: Set<number>
  alive: boolean
  expiresAt: number
  dropped: number
}

export interface RealtimeGatewayDeps {
  sessionSecret: string
  roomManager: RoomManager
  logger: Logger
}

const MAX_BUFFERED_BYTES = 1024 * 1024

export class RealtimeGateway {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 })
  private readonly clients = new Set<Client>()
  private readonly roomClients = new Map<number, Set<Client>>()
  private readonly roomUnsubs = new Map<number, () => void>()
  private statusUnsub: (() => void) | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private started = false

  constructor(
    private readonly server: HttpServer,
    private readonly deps: RealtimeGatewayDeps,
  ) {}

  start(): void {
    if (this.started) return
    this.started = true
    this.server.on('upgrade', this.handleUpgrade)
    this.statusUnsub = this.deps.roomManager.subscribeStatus((rooms) => {
      this.broadcastAll({ type: 'room_status', rooms })
    })
    this.heartbeatTimer = setInterval(() => this.checkClients(), 30_000)
    this.heartbeatTimer.unref()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.server.off('upgrade', this.handleUpgrade)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    this.statusUnsub?.()
    this.statusUnsub = null
    for (const unsubscribe of this.roomUnsubs.values()) unsubscribe()
    this.roomUnsubs.clear()
    this.roomClients.clear()
    for (const client of this.clients) {
      try {
        client.socket.close(1013, '服务正在关闭')
      } catch {
        // 已关闭
      }
    }
    this.clients.clear()
    this.wss.close()
  }

  private handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }

    const cookies = parseCookies(req.headers.cookie)
    const session = verifySessionToken(cookies[SESSION_COOKIE], this.deps.sessionSecret)
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    const origin = req.headers.origin
    if (origin) {
      try {
        const originHost = new URL(origin).host
        if (!req.headers.host || originHost !== req.headers.host) {
          socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
          socket.destroy()
          return
        }
      } catch {
        socket.destroy()
        return
      }
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.onConnection(ws, session)
    })
  }

  private onConnection(socket: WebSocket, session: SessionPayload): void {
    const client: Client = {
      socket,
      rooms: new Set(),
      alive: true,
      expiresAt: session.exp,
      dropped: 0,
    }
    this.clients.add(client)

    socket.on('pong', () => {
      client.alive = true
    })
    socket.on('message', (data) => this.onMessage(client, data))
    socket.on('close', () => this.removeClient(client))
    socket.on('error', () => this.removeClient(client))

    this.sendTo(client, {
      type: 'hello',
      rooms: this.deps.roomManager.list(),
      serverTime: Date.now(),
      sessionExpiresAt: session.exp,
    })
  }

  private onMessage(client: Client, data: RawData): void {
    let message: unknown
    try {
      message = JSON.parse(data.toString())
    } catch {
      this.sendTo(client, { type: 'error', code: 'INVALID_MESSAGE', message: '消息格式错误' })
      return
    }
    if (!message || typeof message !== 'object') return
    const record = message as { type?: unknown; roomId?: unknown; t?: unknown }

    if (record.type === 'ping') {
      this.sendTo(client, {
        type: 'pong',
        t: typeof record.t === 'number' ? record.t : undefined,
        serverTime: Date.now(),
      })
      return
    }

    if (record.type === 'subscribe') {
      const roomId = Number(record.roomId)
      if (!Number.isInteger(roomId) || !this.deps.roomManager.get(roomId)) {
        this.sendTo(client, { type: 'error', code: 'ROOM_NOT_FOUND', message: '直播间不存在' })
        return
      }
      this.subscribe(client, roomId)
      return
    }

    if (record.type === 'unsubscribe') {
      const roomId = Number(record.roomId)
      if (Number.isInteger(roomId)) this.unsubscribe(client, roomId)
    }
  }

  private subscribe(client: Client, roomId: number): void {
    client.rooms.add(roomId)
    let subscribers = this.roomClients.get(roomId)
    if (!subscribers) {
      subscribers = new Set()
      this.roomClients.set(roomId, subscribers)
      const unsubscribe = this.deps.roomManager.subscribe(roomId, (events) =>
        this.pushEvents(roomId, events),
      )
      this.roomUnsubs.set(roomId, unsubscribe)
    }
    subscribers.add(client)
  }

  private unsubscribe(client: Client, roomId: number): void {
    client.rooms.delete(roomId)
    const subscribers = this.roomClients.get(roomId)
    if (!subscribers) return
    subscribers.delete(client)
    if (subscribers.size === 0) {
      this.roomUnsubs.get(roomId)?.()
      this.roomUnsubs.delete(roomId)
      this.roomClients.delete(roomId)
    }
  }

  private removeClient(client: Client): void {
    if (!this.clients.delete(client)) return
    for (const roomId of [...client.rooms]) this.unsubscribe(client, roomId)
  }

  private pushEvents(roomId: number, events: NormalizedEvent[]): void {
    const subscribers = this.roomClients.get(roomId)
    if (!subscribers) return
    for (const client of subscribers) {
      const dropped = client.dropped
      client.dropped = 0
      this.sendTo(client, { type: 'events', roomId, events, ...(dropped > 0 ? { dropped } : {}) })
    }
  }

  private sendTo(client: Client, message: ServerMessage): void {
    if (client.socket.readyState !== WebSocket.OPEN) return
    if (client.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      client.dropped += 1
      return
    }
    try {
      client.socket.send(JSON.stringify(message))
    } catch {
      this.removeClient(client)
    }
  }

  private broadcastAll(message: ServerMessage): void {
    for (const client of this.clients) this.sendTo(client, message)
  }

  private checkClients(): void {
    const now = Date.now()
    for (const client of this.clients) {
      if (client.expiresAt <= now) {
        try {
          client.socket.close(4401, '登录已过期')
        } catch {
          // 已关闭
        }
        this.removeClient(client)
        continue
      }
      if (!client.alive) {
        client.socket.terminate()
        this.removeClient(client)
        continue
      }
      client.alive = false
      try {
        client.socket.ping()
      } catch {
        this.removeClient(client)
      }
    }
  }
}
