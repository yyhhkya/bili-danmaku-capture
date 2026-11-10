import fs from 'node:fs'
import path from 'node:path'

import type { EventEmoticon } from '../../shared/types.js'
import { normalizeEmoticonEntry } from '../bili/emoticons.js'
import type { Logger } from '../logger.js'

interface StoredEmoteFile {
  version?: number
  updatedAt?: number
  emoticons?: unknown
}

/**
 * 房间级表情字典缓存：`data/emoticons/<真实房间号>.json`。
 * 保存包级接口与历史弹幕学到的 token，重启后无需重新等待。
 */
export class EmoteStore {
  private readonly dir: string

  constructor(
    dataDir: string,
    private readonly logger: Logger,
  ) {
    this.dir = path.join(dataDir, 'emoticons')
  }

  private filePath(roomId: number): string {
    return path.join(this.dir, `${roomId}.json`)
  }

  async load(roomId: number): Promise<Record<string, EventEmoticon>> {
    try {
      const raw = await fs.promises.readFile(this.filePath(roomId), 'utf8')
      const parsed = JSON.parse(raw) as StoredEmoteFile
      const source = parsed.emoticons
      if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
      const result: Record<string, EventEmoticon> = {}
      for (const [token, value] of Object.entries(source as Record<string, unknown>)) {
        if (!token.startsWith('[') || token.length > 64) continue
        const entry = normalizeEmoticonEntry(value)
        if (entry) result[token] = entry
      }
      return result
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        this.logger.warn('表情缓存读取失败，将重新拉取', {
          roomId,
          reason: error instanceof Error ? error.message : '未知错误',
        })
      }
      return {}
    }
  }

  async save(roomId: number, emoticons: Record<string, EventEmoticon>): Promise<void> {
    await fs.promises.mkdir(this.dir, { recursive: true })
    const file = this.filePath(roomId)
    const tmp = `${file}.${process.pid}.tmp`
    const payload = JSON.stringify({ version: 1, updatedAt: Date.now(), emoticons }, null, 2)
    await fs.promises.writeFile(tmp, payload, 'utf8')
    try {
      await fs.promises.rename(tmp, file)
    } catch {
      await fs.promises.rm(file, { force: true })
      await fs.promises.rename(tmp, file)
    }
  }
}
