import type { NormalizedEvent, RoomSummary } from './types.js'

export type ClientMessage =
  | { type: 'subscribe'; roomId: number }
  | { type: 'unsubscribe'; roomId: number }
  | { type: 'ping'; t?: number }

export type ServerMessage =
  | {
      type: 'hello'
      rooms: RoomSummary[]
      serverTime: number
      sessionExpiresAt: number
    }
  | { type: 'room_status'; rooms: RoomSummary[] }
  | { type: 'events'; roomId: number; events: NormalizedEvent[]; dropped?: number }
  | { type: 'pong'; t?: number; serverTime: number }
  | { type: 'error'; code: string; message: string }
