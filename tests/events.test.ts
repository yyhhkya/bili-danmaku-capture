import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeMessage } from '../src/server/bili/events.js'

const roomId = 5440
const receivedAt = 1_800_000_000_000

test('归一化带后缀的 DANMU_MSG', () => {
  const payload = {
    cmd: 'DANMU_MSG:4:0:2:2:2:0',
    msg_id: 'm1',
    info: [
      [
        0,
        1,
        25,
        16777215,
        1_700_000_000_000,
        -1,
        0,
        '0',
        0,
        0,
        0,
        '',
        0,
        '',
        '',
        {
          extra: JSON.stringify({ id_str: 'extra-id' }),
          user: {
            uid: 123,
            base: { name: '张三', face: 'https://i0.hdslb.com/face.jpg' },
            guard: { level: 3 },
            medal: { medal_level: 21, medal_name: '牌子', anchor_uname: '主播' },
          },
        },
      ],
      '你好，世界',
      [123, '张三', 1, 0, 0, 0, 0],
      [21, '牌子', '主播', 0, 1725515],
      [],
      [],
      null,
      null,
      null,
      { ts: 1_700_000_001 },
    ],
  }

  const event = normalizeMessage(payload, { roomId, receivedAt })
  assert.ok(event)
  assert.equal(event.type, 'danmaku')
  assert.equal(event.id, 'm1')
  assert.equal(event.text, '你好，世界')
  assert.equal(event.ts, 1_700_000_001_000)
  assert.equal(event.user.uid, 123)
  assert.equal(event.user.uname, '张三')
  assert.equal(event.user.guardLevel, 3)
  assert.equal(event.user.isAdmin, true)
  assert.equal(event.user.medal?.level, 21)
  assert.equal(event.color, '#ffffff')
})

test('归一化醒目留言', () => {
  const event = normalizeMessage(
    {
      cmd: 'SUPER_CHAT_MESSAGE',
      data: {
        id: 99,
        uid: 5,
        message: '加油',
        price: 30,
        time: 60,
        ts: 1_700_000_001,
        user_info: { uname: '李四', face: 'https://i0.hdslb.com/a.jpg', guard_level: 2 },
        medal_info: {
          medal_level: 10,
          medal_name: '牌子',
          anchor_uname: '主播',
          guard_level: 2,
        },
      },
    },
    { roomId, receivedAt },
  )
  assert.ok(event)
  assert.equal(event.type, 'superchat')
  assert.equal(event.id, 'sc-99')
  assert.equal(event.text, '加油')
  assert.equal(event.price, 30)
  assert.equal(event.extra?.duration, 60)
  assert.equal(event.user.medal?.level, 10)
})

test('归一化礼物与上舰', () => {
  const gift = normalizeMessage(
    {
      cmd: 'SEND_GIFT',
      data: {
        uid: 6,
        uname: '王五',
        giftName: '辣条',
        num: 3,
        price: 100,
        total_coin: 300,
        timestamp: 1_700_000_002,
        guard_level: 3,
      },
    },
    { roomId, receivedAt },
  )
  assert.ok(gift)
  assert.equal(gift.type, 'gift')
  assert.equal(gift.text, '投喂 辣条 ×3')
  assert.equal(gift.price, 300)
  assert.equal(gift.extra?.num, 3)

  const guard = normalizeMessage(
    {
      cmd: 'GUARD_BUY',
      data: {
        uid: 7,
        username: '赵六',
        guard_level: 3,
        num: 1,
        price: 198000,
        start_time: 1_700_000_003,
      },
    },
    { roomId, receivedAt },
  )
  assert.ok(guard)
  assert.equal(guard.type, 'guard')
  assert.equal(guard.text, '开通舰长')
  assert.equal(guard.price, 198)
  assert.equal(guard.user.guardLevel, 3)
})

test('归一化进场与关注消息', () => {
  const enter = normalizeMessage(
    {
      cmd: 'INTERACT_WORD',
      data: {
        uid: 8,
        uname: '钱七',
        msg_type: 1,
        timestamp: 1_700_000_004,
        fans_medal: { medal_level: 1, medal_name: '牌子', guard_level: 0 },
      },
    },
    { roomId, receivedAt },
  )
  assert.ok(enter)
  assert.equal(enter.type, 'enter')
  assert.equal(enter.text, '进入直播间')

  const follow = normalizeMessage(
    { cmd: 'INTERACT_WORD', data: { uid: 9, uname: '孙八', msg_type: 2 } },
    { roomId, receivedAt },
  )
  assert.ok(follow)
  assert.equal(follow.type, 'follow')

  const share = normalizeMessage(
    { cmd: 'INTERACT_WORD', data: { uid: 9, uname: '孙八', msg_type: 3 } },
    { roomId, receivedAt },
  )
  assert.equal(share, null)
})

test('归一化 INTERACT_WORD_V2 样本', () => {
  const base64 =
    'CJTwwNEBEgpTdGFyU2VhMjQ2IgIDASgBMNWgITispaTDBkDUubHe/jJKLAiv8CkQEhoG55Sf5oCBIKS6ngYopLqeBjCkup4GOKS6ngZAAWDVoCFo9JQRYgB4gZ/v1tmc1qcYmgEAsgHPAQiU8MDRARJYCgpTdGFyU2VhMjQ2EkpodHRwczovL2kwLmhkc2xiLmNvbS9iZnMvZmFjZS8xMDliNzg3YzVmMTEzYzRhM2M3NDE1YmI5YmY2YjgyYmMzM2JjNGUyLmpwZxpnCgbnlJ/mgIEQEhikup4GIKS6ngYopLqeBjCkup4GOP/hAUgBUK/wKWD0lBF6CSNEQzZCNkI5OYIBCSNEQzZCNkI5OYoBCSNEQzZCNkI5OZIBCSNGRkZGRkZGRpoBCSM4MTAwMUY5OSICCAkyALoBAA=='
  const event = normalizeMessage(
    { cmd: 'INTERACT_WORD_V2', data: { pb: base64 } },
    { roomId, receivedAt },
  )
  assert.ok(event)
  assert.equal(event.type, 'enter')
  assert.equal(event.user.uid, 439367700)
  assert.equal(event.user.uname, 'StarSea246')
  assert.equal(event.user.medal?.name, '生态')
  assert.equal(event.ts, 1_751_716_524_000)
})

test('未知消息被忽略', () => {
  assert.equal(normalizeMessage({ cmd: 'ONLINE_RANK_COUNT', data: {} }, { roomId }), null)
  assert.equal(normalizeMessage({ cmd: 'SUPER_CHAT_MESSAGE_JPN', data: {} }, { roomId }), null)
  assert.equal(normalizeMessage(null, { roomId }), null)
  assert.equal(normalizeMessage({}, { roomId }), null)
})
