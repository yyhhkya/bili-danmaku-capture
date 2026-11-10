/** 接受纯房间号或 live.bilibili.com 链接，返回房间号。 */
export function parseRoomIdInput(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 && value <= 999_999_999_999 ? value : null
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null

  if (/^\d{1,12}$/.test(text)) {
    const parsed = Number(text)
    return parsed > 0 ? parsed : null
  }

  const match = text.match(/live\.bilibili\.com\/(?:h5\/)?(\d{1,12})/i)
  if (!match?.[1]) return null
  const parsed = Number(match[1])
  return parsed > 0 ? parsed : null
}
