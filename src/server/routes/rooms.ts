import { Router } from 'express'

import type { RoomDatesResponse, RoomHistoryResponse } from '../../shared/types.js'
import { parseRoomIdInput } from '../../shared/rooms.js'
import { shanghaiDateKey } from '../../shared/time.js'
import { BiliApiError } from '../bili/http.js'
import type { Logger } from '../logger.js'
import { RoomError, type RoomManager } from '../monitor/manager.js'

function fail(res: import('express').Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } })
}

function readDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return value
}

function roomIdFromParam(value: string): number | null {
  if (!/^\d{1,12}$/.test(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function handleError(
  res: import('express').Response,
  error: unknown,
  logger: Logger,
  fallback: string,
): void {
  if (error instanceof RoomError) {
    const status =
      error.code === 'ROOM_NOT_FOUND'
        ? 404
        : error.code === 'INVALID_ROOM'
          ? 400
          : error.code === 'ROOM_LIMIT' || error.code === 'ROOM_EXISTS'
            ? 409
            : 400
    fail(res, status, error.code, error.message)
    return
  }
  if (error instanceof BiliApiError) {
    fail(res, 502, `BILI_${error.code}`, error.message)
    return
  }
  const message = error instanceof Error ? error.message : fallback
  logger.warn('房间接口请求失败', { reason: message })
  fail(res, 502, 'ROOM_REQUEST_FAILED', message)
}

export function createRoomsRouter(manager: RoomManager, logger: Logger): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(manager.list())
  })

  router.post('/', async (req, res) => {
    const roomId = parseRoomIdInput(req.body?.roomId)
    if (!roomId) {
      fail(res, 400, 'INVALID_ROOM', '请输入有效的房间号或直播间链接')
      return
    }
    if (manager.get(roomId)) {
      fail(res, 409, 'ROOM_EXISTS', '该直播间已在监控列表中')
      return
    }
    try {
      const room = await manager.add(roomId)
      res.status(201).json({ room })
    } catch (error) {
      handleError(res, error, logger, '添加直播间失败')
    }
  })

  router.delete('/:roomId', async (req, res) => {
    const roomId = roomIdFromParam(req.params.roomId)
    if (!roomId) {
      fail(res, 400, 'INVALID_ROOM', '房间号不合法')
      return
    }
    try {
      const removed = await manager.remove(roomId)
      if (!removed) {
        fail(res, 404, 'ROOM_NOT_FOUND', '直播间不在监控列表中')
        return
      }
      res.status(204).end()
    } catch (error) {
      handleError(res, error, logger, '移除直播间失败')
    }
  })

  router.post('/:roomId/reconnect', (req, res) => {
    const roomId = roomIdFromParam(req.params.roomId)
    if (!roomId) {
      fail(res, 400, 'INVALID_ROOM', '房间号不合法')
      return
    }
    try {
      manager.reconnect(roomId)
      res.json(manager.get(roomId))
    } catch (error) {
      handleError(res, error, logger, '重连失败')
    }
  })

  router.get('/:roomId/history', async (req, res) => {
    const roomId = roomIdFromParam(req.params.roomId)
    const date = readDate(req.query.date) ?? shanghaiDateKey()
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200))
    const beforeRaw = typeof req.query.before === 'string' ? req.query.before.trim() : ''
    const before = beforeRaw === '' ? null : Number(beforeRaw)
    if (!roomId) {
      fail(res, 400, 'INVALID_ROOM', '房间号不合法')
      return
    }
    if (before !== null && (!Number.isInteger(before) || before < 0)) {
      fail(res, 400, 'INVALID_CURSOR', '分页游标不合法')
      return
    }
    try {
      const page = await manager.history(roomId, date, limit, before)
      const body: RoomHistoryResponse = { date, ...page }
      res.json(body)
    } catch (error) {
      handleError(res, error, logger, '读取历史弹幕失败')
    }
  })

  router.get('/:roomId/dates', async (req, res) => {
    const roomId = roomIdFromParam(req.params.roomId)
    if (!roomId) {
      fail(res, 400, 'INVALID_ROOM', '房间号不合法')
      return
    }
    try {
      const body: RoomDatesResponse = { dates: await manager.dates(roomId) }
      res.json(body)
    } catch (error) {
      handleError(res, error, logger, '读取记录日期失败')
    }
  })

  router.get('/:roomId/export', async (req, res) => {
    const roomId = roomIdFromParam(req.params.roomId)
    const date = readDate(req.query.date) ?? shanghaiDateKey()
    if (!roomId) {
      fail(res, 400, 'INVALID_ROOM', '房间号不合法')
      return
    }
    if (!manager.get(roomId)) {
      fail(res, 404, 'ROOM_NOT_FOUND', '直播间不在监控列表中')
      return
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="room-${roomId}-${date}.csv"; filename*=UTF-8''${encodeURIComponent(
        `直播间${roomId}-${date}.csv`,
      )}`,
    )
    try {
      await manager.exportCsv(roomId, date, res)
      res.end()
    } catch (error) {
      logger.warn('导出 CSV 失败', {
        reason: error instanceof Error ? error.message : '未知错误',
      })
      res.end()
    }
  })

  return router
}
