import { createReadStream } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import type { Response } from 'express'

import type { NormalizedEvent } from '../../shared/types.js'
import { shanghaiDateKey, shanghaiDateTime } from '../../shared/time.js'
import type { Logger } from '../logger.js'

const MAX_TAIL_BYTES = 8 * 1024 * 1024
const FLUSH_INTERVAL_MS = 200
const FLUSH_BATCH = 200

export interface StoredRoom {
  inputRoomId: number
  realRoomId: number
  title: string
  uname: string
  addedAt: number
}

const TYPE_LABELS: Record<NormalizedEvent['type'], string> = {
  danmaku: '弹幕',
  superchat: '醒目留言',
  gift: '礼物',
  guard: '上舰',
  enter: '进场',
  follow: '关注',
}

export function csvEscape(value: string): string {
  let text = value
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

export function eventToCsvRow(event: NormalizedEvent): string {
  const medal = event.user.medal ? `${event.user.medal.name} ${event.user.medal.level}` : ''
  const guard =
    event.user.guardLevel === 1
      ? '总督'
      : event.user.guardLevel === 2
        ? '提督'
        : event.user.guardLevel === 3
          ? '舰长'
          : ''
  const extraParts: string[] = []
  if (event.extra?.giftName) extraParts.push(`${event.extra.giftName}×${event.extra.num ?? 1}`)
  if (event.extra?.duration) extraParts.push(`${event.extra.duration}秒`)

  return [
    shanghaiDateTime(event.ts),
    TYPE_LABELS[event.type],
    event.user.uname,
    String(event.user.uid),
    event.text,
    event.price !== undefined ? String(event.price) : '',
    medal,
    guard,
    extraParts.join(' '),
  ]
    .map(csvEscape)
    .join(',')
}

export const CSV_HEADER = '时间,类型,用户名,UID,内容,金额,粉丝牌,大航海,附加'

export function parseEventLine(line: string): NormalizedEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as NormalizedEvent
    return parsed && parsed.v === 1 && typeof parsed.ts === 'number' ? parsed : null
  } catch {
    return null
  }
}

export interface HistoryPage {
  events: NormalizedEvent[]
  /** 下一页游标：本页最早事件的 ts；null 表示没有更早的记录 */
  nextBefore: number | null
  hasMore: boolean
}

/** 只取一行的 ts 字段，避免过滤时对整行做 JSON 解析。 */
function readLineTs(line: string): number | null {
  const marker = '"ts":'
  const index = line.indexOf(marker)
  if (index < 0) return null
  const begin = index + marker.length
  let cursor = begin
  while (cursor < line.length) {
    const code = line.charCodeAt(cursor) - 48
    if (code < 0 || code > 9) break
    cursor += 1
  }
  if (cursor === begin) return null
  const value = Number(line.slice(begin, cursor))
  return Number.isFinite(value) ? value : null
}

export class JsonlStore {
  private buffer: NormalizedEvent[] = []
  private timer: NodeJS.Timeout | null = null
  private writeChain: Promise<void> = Promise.resolve()
  private closed = false

  constructor(
    private readonly dir: string,
    private readonly logger: Logger,
  ) {}

  append(event: NormalizedEvent): void {
    if (this.closed) return
    this.buffer.push(event)
    if (this.buffer.length >= FLUSH_BATCH) {
      void this.flush()
      return
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null
        void this.flush()
      }, FLUSH_INTERVAL_MS)
      this.timer.unref()
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const events = this.buffer.splice(0)
    const groups = new Map<string, string[]>()
    for (const event of events) {
      const date = shanghaiDateKey(event.ts)
      const lines = groups.get(date) ?? []
      lines.push(JSON.stringify(event))
      groups.set(date, lines)
    }

    this.writeChain = this.writeChain
      .then(() => this.writeGroups(groups))
      .catch((error: unknown) => {
        this.logger.error('写入弹幕文件失败', {
          reason: error instanceof Error ? error.message : '未知错误',
        })
      })
    await this.writeChain
  }

  private async writeGroups(groups: Map<string, string[]>): Promise<void> {
    await fs.promises.mkdir(this.dir, { recursive: true })
    for (const [date, lines] of groups) {
      await fs.promises.appendFile(this.filePath(date), `${lines.join('\n')}\n`, 'utf8')
    }
  }

  private filePath(date: string): string {
    return path.join(this.dir, `${date}.jsonl`)
  }

  async close(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.closed = true
    await this.flush()
  }

  async listDates(): Promise<Array<{ date: string; size: number }>> {
    try {
      const entries = await fs.promises.readdir(this.dir)
      const dates: Array<{ date: string; size: number }> = []
      for (const entry of entries) {
        const match = entry.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/)
        if (!match) continue
        const stat = await fs.promises.stat(path.join(this.dir, entry))
        dates.push({ date: match[1] as string, size: stat.size })
      }
      return dates.sort((a, b) => b.date.localeCompare(a.date))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  async readRecent(date: string, limit: number): Promise<NormalizedEvent[]> {
    const page = await this.readPage(date, null, limit)
    return page.events
  }

  /**
   * 按时间游标反向翻页：返回严格早于 beforeTs 的最近 limit 条记录。
   * 从文件尾部向前扩窗读取，游标翻页不依赖一次读完整天。
   */
  async readPage(
    date: string,
    beforeTs: number | null,
    limit: number,
  ): Promise<HistoryPage> {
    const file = this.filePath(date)
    let stat: fs.Stats
    try {
      stat = await fs.promises.stat(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { events: [], nextBefore: null, hasMore: false }
      }
      throw error
    }
    if (stat.size === 0) return { events: [], nextBefore: null, hasMore: false }

    let size = Math.min(stat.size, 256 * 1024)
    let start = Math.max(0, stat.size - size)
    for (;;) {
      const handle = await fs.promises.open(file, 'r')
      let text: string
      try {
        const buffer = Buffer.alloc(size)
        await handle.read(buffer, 0, size, start)
        text = buffer.toString('utf8')
      } finally {
        await handle.close()
      }
      if (start > 0) {
        const newline = text.indexOf('\n')
        text = newline >= 0 ? text.slice(newline + 1) : ''
      }
      const lines = text.split('\n').filter((line) => line.trim().length > 0)
      const candidates = lines.filter((line) => {
        const ts = readLineTs(line)
        if (ts === null) return false
        return beforeTs === null || ts < beforeTs
      })

      if (candidates.length > limit || start === 0 || size >= MAX_TAIL_BYTES) {
        const selected = candidates.slice(-limit)
        const events = selected
          .map(parseEventLine)
          .filter((event): event is NormalizedEvent => event !== null)
        const oldest = events[0]
        const hasMore = events.length > 0 && (candidates.length > selected.length || start > 0)
        return {
          events,
          nextBefore: oldest ? oldest.ts : null,
          hasMore,
        }
      }

      size = Math.min(size * 2, MAX_TAIL_BYTES)
      start = Math.max(0, stat.size - size)
    }
  }

  async hasDate(date: string): Promise<boolean> {
    try {
      await fs.promises.access(this.filePath(date))
      return true
    } catch {
      return false
    }
  }

  async streamCsv(date: string, res: Response): Promise<void> {
    res.write('﻿')
    res.write(`${CSV_HEADER}\n`)
    if (!(await this.hasDate(date))) return

    const stream = createReadStream(this.filePath(date), { encoding: 'utf8' })
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity })
    try {
      for await (const line of reader) {
        const event = parseEventLine(line)
        if (!event) continue
        const row = `${eventToCsvRow(event)}\n`
        if (!res.write(row)) {
          await new Promise<void>((resolve) => res.once('drain', resolve))
        }
      }
    } finally {
      reader.close()
      stream.destroy()
    }
  }
}

export class RoomRepository {
  private readonly file: string

  constructor(
    dataDir: string,
    private readonly logger: Logger,
  ) {
    this.file = path.join(dataDir, 'rooms.json')
  }

  async load(): Promise<StoredRoom[]> {
    try {
      const raw = await fs.promises.readFile(this.file, 'utf8')
      const data = JSON.parse(raw) as { version?: number; rooms?: StoredRoom[] }
      if (!Array.isArray(data.rooms)) return []
      return data.rooms.filter(
        (room) =>
          Number.isInteger(room.realRoomId) && room.realRoomId > 0 && Number.isInteger(room.inputRoomId),
      )
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        this.logger.warn('房间配置文件读取失败，将使用空列表', {
          reason: error instanceof Error ? error.message : '未知错误',
        })
      }
      return []
    }
  }

  async save(rooms: StoredRoom[]): Promise<void> {
    const dataDir = path.dirname(this.file)
    await fs.promises.mkdir(dataDir, { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    await fs.promises.writeFile(tmp, JSON.stringify({ version: 1, rooms }, null, 2), 'utf8')
    try {
      await fs.promises.rename(tmp, this.file)
    } catch {
      await fs.promises.rm(this.file, { force: true })
      await fs.promises.rename(tmp, this.file)
    }
  }
}
