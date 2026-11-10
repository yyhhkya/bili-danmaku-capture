import type { ServerMessage } from '../shared/protocol.js'

export type ConnectionState = 'connecting' | 'open' | 'closed'

export interface RealtimeHandlers {
  onHello?: (message: Extract<ServerMessage, { type: 'hello' }>) => void
  onStatus?: (message: Extract<ServerMessage, { type: 'room_status' }>) => void
  onEvents?: (message: Extract<ServerMessage, { type: 'events' }>) => void
  onError?: (message: Extract<ServerMessage, { type: 'error' }>) => void
  onConnection?: (state: ConnectionState) => void
  onAuthExpired?: () => void
}

export class RealtimeClient {
  private socket: WebSocket | null = null
  private readonly subscriptions = new Set<number>()
  private attempt = 0
  private reconnectTimer: number | null = null
  private closed = false

  constructor(private readonly handlers: RealtimeHandlers) {}

  connect(): void {
    this.closed = false
    this.open()
  }

  private open(): void {
    if (this.closed) return
    this.handlers.onConnection?.('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`)
    this.socket = socket

    socket.onopen = () => {
      this.attempt = 0
      this.handlers.onConnection?.('open')
      for (const roomId of this.subscriptions) {
        this.send({ type: 'subscribe', roomId })
      }
    }

    socket.onmessage = (event) => {
      let message: ServerMessage
      try {
        message = JSON.parse(String(event.data)) as ServerMessage
      } catch {
        return
      }
      switch (message.type) {
        case 'hello':
          this.handlers.onHello?.(message)
          break
        case 'room_status':
          this.handlers.onStatus?.(message)
          break
        case 'events':
          this.handlers.onEvents?.(message)
          break
        case 'error':
          this.handlers.onError?.(message)
          break
      }
    }

    socket.onclose = (event) => {
      this.socket = null
      if (this.closed) return
      this.handlers.onConnection?.('closed')
      if (event.code === 4401) {
        this.closed = true
        this.handlers.onAuthExpired?.()
        return
      }
      void fetch('/api/auth/me')
        .then((response) => response.json())
        .then((body: { authenticated?: boolean }) => {
          if (!body.authenticated) {
            this.closed = true
            this.handlers.onAuthExpired?.()
          }
        })
        .catch(() => undefined)
      this.scheduleReconnect()
    }

    socket.onerror = () => {
      // onclose 会负责重连
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return
    const delay = Math.min(15_000, 1000 * Math.pow(1.8, Math.min(this.attempt, 8)))
    this.attempt += 1
    this.reconnectTimer = window.setTimeout(() => this.open(), delay)
  }

  private send(message: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
    }
  }

  subscribe(roomId: number): void {
    this.subscriptions.add(roomId)
    this.send({ type: 'subscribe', roomId })
  }

  unsubscribe(roomId: number): void {
    this.subscriptions.delete(roomId)
    this.send({ type: 'unsubscribe', roomId })
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
  }
}
