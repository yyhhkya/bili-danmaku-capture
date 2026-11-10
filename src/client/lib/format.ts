import type { RoomConnectionState } from '../../shared/types.js'

export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`
  return value.toLocaleString('zh-CN')
}

export function formatPrice(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export function guardName(level: number): string | null {
  if (level === 1) return '总督'
  if (level === 2) return '提督'
  if (level === 3) return '舰长'
  return null
}

export function connectionLabel(state: RoomConnectionState): {
  label: string
  tone: 'live' | 'warn' | 'danger' | 'muted'
} {
  switch (state) {
    case 'connected':
      return { label: '已连接', tone: 'live' }
    case 'resolving':
    case 'connecting':
    case 'authenticating':
      return { label: '连接中', tone: 'warn' }
    case 'reconnecting':
      return { label: '重连中', tone: 'warn' }
    case 'closed':
      return { label: '已断开', tone: 'danger' }
    default:
      return { label: '未连接', tone: 'muted' }
  }
}

export function liveLabel(status: 0 | 1 | 2): {
  label: string
  tone: 'live' | 'warn' | 'muted'
} {
  if (status === 1) return { label: '直播中', tone: 'live' }
  if (status === 2) return { label: '轮播中', tone: 'warn' }
  return { label: '未开播', tone: 'muted' }
}

/** 弹幕颜色在深色背景上过暗时回退到默认前景色。 */
export function readableDanmakuColor(color: string | undefined): string | undefined {
  if (!color) return undefined
  const match = color.match(/^#([0-9a-f]{6})$/i)
  if (!match?.[1]) return undefined
  const value = Number.parseInt(match[1], 16)
  const red = (value >> 16) & 0xff
  const green = (value >> 8) & 0xff
  const blue = value & 0xff
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance < 0.42 ? undefined : color
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
