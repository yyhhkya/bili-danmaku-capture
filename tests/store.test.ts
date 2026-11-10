import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { NormalizedEvent } from '../src/shared/types.js'
import { parseRoomIdInput } from '../src/shared/rooms.js'
import { shanghaiDateKey } from '../src/shared/time.js'
import { createLogger } from '../src/server/logger.js'
import {
  JsonlStore,
  RoomRepository,
  csvEscape,
  eventToCsvRow,
} from '../src/server/monitor/store.js'
import { EmoteStore } from '../src/server/monitor/emote-store.js'

const silent = createLogger('error')

function makeEvent(
  ts: number,
  text: string,
  emoticons?: NormalizedEvent['emoticons'],
): NormalizedEvent {
  return {
    v: 1,
    id: randomUUID(),
    roomId: 1,
    type: 'danmaku',
    ts,
    receivedAt: ts,
    user: { uid: 1, uname: '测试用户', guardLevel: 0 },
    text,
    emoticons,
  }
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bdc-store-'))
  try {
    await fn(dir)
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
}

test('JSONL 按北京时间日期落盘，可反向读取最近记录', async () => {
  await withTempDir(async (dir) => {
    const store = new JsonlStore(path.join(dir, 'room'), silent)
    const base = Date.UTC(2026, 10, 10, 12, 0, 0)
    const emoticons = {
      '[OH]': { url: 'https://i0.hdslb.com/bfs/live/oh.png', width: 20, height: 20 },
    }
    store.append(makeEvent(base, '第一条'))
    store.append(makeEvent(base + 1000, '[OH]', emoticons))
    await store.flush()
    await store.close()

    const date = shanghaiDateKey(base)
    assert.equal(date, '2026-11-10')
    const file = path.join(dir, 'room', `${date}.jsonl`)
    const lines = (await fs.promises.readFile(file, 'utf8')).trim().split('\n')
    assert.equal(lines.length, 2)

    const reopened = new JsonlStore(path.join(dir, 'room'), silent)
    const recent = await reopened.readRecent(date, 1)
    assert.equal(recent.length, 1)
    assert.equal(recent[0]?.text, '[OH]')
    assert.deepEqual(recent[0]?.emoticons, emoticons)

    const dates = await reopened.listDates()
    assert.deepEqual(dates.map((item) => item.date), [date])
  })
})

test('CSV 转义防止公式注入与引号破坏', () => {
  assert.equal(csvEscape('普通文本'), '普通文本')
  assert.equal(csvEscape('=1+1'), "'=1+1")
  assert.equal(csvEscape('a,b'), '"a,b"')
  assert.equal(csvEscape('a"b'), '"a""b"')
  assert.equal(csvEscape('第一行\n第二行'), '"第一行\n第二行"')

  const row = eventToCsvRow(makeEvent(1_700_000_000_000, '=cmd'))
  assert.match(row, /'=cmd/)
  assert.match(row, /弹幕/)
})

test('房间配置原子写入并可读回', async () => {
  await withTempDir(async (dir) => {
    const repo = new RoomRepository(dir, silent)
    await repo.save([
      { inputRoomId: 6, realRoomId: 7734200, title: '测试', uname: '主播', addedAt: 1 },
    ])
    const loaded = await repo.load()
    assert.deepEqual(loaded, [
      { inputRoomId: 6, realRoomId: 7734200, title: '测试', uname: '主播', addedAt: 1 },
    ])
  })
})

test('解析房间号与直播间链接', () => {
  assert.equal(parseRoomIdInput(6), 6)
  assert.equal(parseRoomIdInput('5440'), 5440)
  assert.equal(parseRoomIdInput('https://live.bilibili.com/5440?broadcast_type=0'), 5440)
  assert.equal(parseRoomIdInput('https://live.bilibili.com/h5/5440'), 5440)
  assert.equal(parseRoomIdInput('abc'), null)
  assert.equal(parseRoomIdInput(-1), null)
  assert.equal(parseRoomIdInput(''), null)
  assert.equal(parseRoomIdInput(null), null)
})

test('房间表情缓存可写入读回，并过滤非法来源', async () => {
  await withTempDir(async (dir) => {
    const store = new EmoteStore(dir, silent)
    assert.deepEqual(await store.load(30866874), {})

    await store.save(30866874, {
      '[有趣]': { url: 'https://i0.hdslb.com/bfs/live/room.png', width: 162, height: 162 },
    })
    assert.deepEqual(await store.load(30866874), {
      '[有趣]': { url: 'https://i0.hdslb.com/bfs/live/room.png', width: 162, height: 162 },
    })

    await fs.promises.mkdir(path.join(dir, 'emoticons'), { recursive: true })
    await fs.promises.writeFile(
      path.join(dir, 'emoticons', '42.json'),
      JSON.stringify({
        version: 1,
        emoticons: {
          '[好]': { url: 'https://evil.example/x.png', width: 20, height: 20 },
          '[行]': { url: 'http://i0.hdslb.com/bfs/live/ok.png', width: 20, height: 20 },
          bad: { url: 'https://i0.hdslb.com/bfs/live/key.png' },
        },
      }),
      'utf8',
    )
    const filtered = await store.load(42)
    assert.deepEqual(Object.keys(filtered), ['[行]'])
    assert.equal(filtered['[行]']?.url, 'https://i0.hdslb.com/bfs/live/ok.png')
  })
})
