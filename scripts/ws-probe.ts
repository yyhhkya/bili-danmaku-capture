import WebSocket from 'ws'

import type { ClientMessage, ServerMessage } from '../src/shared/protocol.js'
import type { RoomSummary } from '../src/shared/types.js'
import { parseRoomIdInput } from '../src/shared/rooms.js'
import { loadConfig, loadDotEnv } from '../src/server/config.js'

loadDotEnv()
const config = loadConfig()
const base = `http://127.0.0.1:${config.port}`
const roomInput = process.argv[2] ?? '6'
const seconds = Number(process.argv[3] ?? 20)
const roomId = parseRoomIdInput(roomInput)
if (!roomId) {
  console.error('用法：npx tsx scripts/ws-probe.ts <直播间号> [持续秒数]')
  process.exit(1)
}

async function login(): Promise<string> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: config.accessKey }),
  })
  if (!response.ok) throw new Error(`登录失败：HTTP ${response.status}`)
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

async function ensureRoom(cookie: string): Promise<{ realRoomId: number; added: boolean }> {
  const response = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ roomId: roomInput }),
  })
  if (response.status === 201) {
    const body = (await response.json()) as { room: RoomSummary }
    return { realRoomId: body.room.roomId, added: true }
  }
  if (response.status === 409) {
    const rooms = (await fetch(`${base}/api/rooms`, { headers: { Cookie: cookie } }).then((res) =>
      res.json(),
    )) as RoomSummary[]
    const existing = rooms.find(
      (room) => room.roomId === roomId || room.inputRoomId === roomId,
    )
    if (existing) return { realRoomId: existing.roomId, added: false }
  }
  throw new Error(`添加房间失败：HTTP ${response.status} ${await response.text()}`)
}

const unauth = new WebSocket(`ws://127.0.0.1:${config.port}/ws`)
unauth.on('unexpected-response', (_request, response) => {
  console.log(`[未登录 WS] HTTP ${response.statusCode}`)
  unauth.terminate()
})
unauth.on('error', () => undefined)

const cookie = await login()
const room = await ensureRoom(cookie)
console.log(`[准备] 房间 ${room.realRoomId}，${room.added ? '本次新增' : '已在列表中'}`)

const socket = new WebSocket(`ws://127.0.0.1:${config.port}/ws`, {
  headers: { Cookie: cookie, Origin: base },
})

socket.on('open', () => {
  console.log('[WS] 已连接，发送订阅')
  const message: ClientMessage = { type: 'subscribe', roomId: room.realRoomId }
  socket.send(JSON.stringify(message))
})

socket.on('message', (data) => {
  const message = JSON.parse(data.toString()) as ServerMessage
  if (message.type === 'hello') {
    console.log(`[hello] 房间 ${message.rooms.length} 个`)
  } else if (message.type === 'room_status') {
    console.log(
      `[状态] ${message.rooms.map((item) => `${item.roomId}:${item.connection}`).join(', ')}`,
    )
  } else if (message.type === 'events') {
    const preview = message.events
      .slice(0, 3)
      .map((event) => `${event.user.uname}：${event.text}`)
      .join(' | ')
    console.log(`[事件] +${message.events.length}${message.dropped ? `（丢弃 ${message.dropped} 批）` : ''} ${preview}`)
  } else if (message.type === 'error') {
    console.error(`[错误] ${message.message}`)
  }
})

socket.on('error', (error) => console.error('[WS 错误]', error.message))

setTimeout(async () => {
  socket.close()
  if (room.added) {
    await fetch(`${base}/api/rooms/${room.realRoomId}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    })
    console.log('[清理] 已移除本次添加的房间')
  }
  process.exit(0)
}, Math.max(5, seconds) * 1000)
