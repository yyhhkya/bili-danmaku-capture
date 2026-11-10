const ZONE = 'Asia/Shanghai'

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const timeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function partsToRecord(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (const part of parts) record[part.type] = part.value
  return record
}

/** 北京时间日期，格式 YYYY-MM-DD。 */
export function shanghaiDateKey(timestamp: number | Date = Date.now()): string {
  return dateKeyFormatter.format(timestamp)
}

/** 北京时间日期时间，格式 YYYY-MM-DD HH:mm:ss。 */
export function shanghaiDateTime(timestamp: number | Date = Date.now()): string {
  const parts = partsToRecord(dateTimeFormatter.formatToParts(timestamp))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

/** 北京时间时刻，格式 HH:mm:ss。 */
export function shanghaiTime(timestamp: number | Date = Date.now()): string {
  const parts = partsToRecord(timeFormatter.formatToParts(timestamp))
  return `${parts.hour}:${parts.minute}:${parts.second}`
}
