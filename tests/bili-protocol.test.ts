import assert from 'node:assert/strict'
import test from 'node:test'
import { brotliCompressSync, deflateSync } from 'node:zlib'

import {
  ProtocolError,
  encodePacket,
  parsePackets,
} from '../src/server/bili/packet.js'
import { decodeInteractWordV2 } from '../src/server/bili/protobuf.js'
import { parseRoomInfo } from '../src/server/bili/room.js'

test('普通包编解码与多包切分', () => {
  const first = encodePacket(5, '{"cmd":"A"}')
  const second = encodePacket(5, '{"cmd":"B"}')
  const result = parsePackets(Buffer.concat([first, second]))
  assert.equal(result.packets.length, 2)
  assert.equal(result.rest.length, 0)
  assert.equal(result.packets[0]?.body.toString('utf8'), '{"cmd":"A"}')
  assert.equal(result.packets[1]?.body.toString('utf8'), '{"cmd":"B"}')
})

test('不完整的包留在 rest 中', () => {
  const full = encodePacket(5, '{"cmd":"A"}')
  const partial = full.subarray(0, full.length - 3)
  const result = parsePackets(partial)
  assert.equal(result.packets.length, 0)
  assert.equal(result.rest.length, partial.length)
})

test('zlib 与 brotli 压缩包会递归展开', () => {
  const inner = encodePacket(5, JSON.stringify({ cmd: 'DANMU_MSG' }))

  const zlibOuter = encodePacket(5, deflateSync(inner), 2)
  const zlibResult = parsePackets(zlibOuter)
  assert.equal(zlibResult.packets.length, 1)
  assert.equal(zlibResult.packets[0]?.body.toString('utf8'), '{"cmd":"DANMU_MSG"}')

  const brotliOuter = encodePacket(5, brotliCompressSync(inner), 3)
  const brotliResult = parsePackets(brotliOuter)
  assert.equal(brotliResult.packets.length, 1)
  assert.equal(brotliResult.packets[0]?.body.toString('utf8'), '{"cmd":"DANMU_MSG"}')
})

test('非法封包头抛出协议错误', () => {
  const bad = Buffer.alloc(16)
  bad.writeUInt32BE(8, 0)
  bad.writeUInt16BE(16, 4)
  assert.throws(() => parsePackets(bad), ProtocolError)
})

test('解析房间信息并回退缺失字段', () => {
  const info = parseRoomInfo(
    {
      room_id: 5440,
      short_id: 6,
      uid: 777,
      title: '测试直播间',
      live_status: 1,
      online: 1234,
      user_cover: 'https://i0.hdslb.com/cover.jpg',
      area_name: '测试分区',
      live_time: '2026-11-10 20:00:00',
    },
    6,
  )
  assert.equal(info.realRoomId, 5440)
  assert.equal(info.inputRoomId, 6)
  assert.equal(info.liveStatus, 1)
  assert.equal(info.anchorUid, 777)

  const fallback = parseRoomInfo(undefined, 42)
  assert.equal(fallback.realRoomId, 42)
  assert.equal(fallback.liveStatus, 0)
  assert.equal(fallback.title, '直播间 42')
})

test('解析 INTERACT_WORD_V2 文档样本', () => {
  const base64 =
    'CJTwwNEBEgpTdGFyU2VhMjQ2IgIDASgBMNWgITispaTDBkDUubHe/jJKLAiv8CkQEhoG55Sf5oCBIKS6ngYopLqeBjCkup4GOKS6ngZAAWDVoCFo9JQRYgB4gZ/v1tmc1qcYmgEAsgHPAQiU8MDRARJYCgpTdGFyU2VhMjQ2EkpodHRwczovL2kwLmhkc2xiLmNvbS9iZnMvZmFjZS8xMDliNzg3YzVmMTEzYzRhM2M3NDE1YmI5YmY2YjgyYmMzM2JjNGUyLmpwZxpnCgbnlJ/mgIEQEhikup4GIKS6ngYopLqeBjCkup4GOP/hAUgBUK/wKWD0lBF6CSNEQzZCNkI5OYIBCSNEQzZCNkI5OYoBCSNEQzZCNkI5OZIBCSNGRkZGRkZGRpoBCSM4MTAwMUY5OSICCAkyALoBAA=='
  const decoded = decodeInteractWordV2(Buffer.from(base64, 'base64'))
  assert.ok(decoded)
  assert.equal(decoded.uid, 439367700)
  assert.equal(decoded.uname, 'StarSea246')
  assert.equal(decoded.msgType, 1)
  assert.equal(decoded.roomId, 544853)
  assert.equal(decoded.timestampSec, 1751716524)
  assert.match(decoded.face, /^https:\/\/i0\.hdslb\.com\//)
  assert.equal(decoded.medal?.name, '生态')
  assert.equal(decoded.medal?.level, 18)
})

test('无效 protobuf 返回 null', () => {
  assert.equal(decodeInteractWordV2(Buffer.from([0xff, 0xff, 0xff])), null)
})
