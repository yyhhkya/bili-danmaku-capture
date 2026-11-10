interface ProtoField {
  field: number
  wire: number
  varint?: number
  bytes?: Buffer
}

function readVarint(buffer: Buffer, offset: number): [bigint, number] {
  let result = 0n
  let shift = 0n
  let cursor = offset
  while (cursor < buffer.length) {
    const byte = buffer[cursor] as number
    cursor += 1
    result |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return [result, cursor]
    shift += 7n
    if (shift > 63n) break
  }
  throw new Error('varint 越界')
}

function readFields(buffer: Buffer): ProtoField[] {
  const fields: ProtoField[] = []
  let offset = 0
  while (offset < buffer.length) {
    const [tagValue, afterTag] = readVarint(buffer, offset)
    offset = afterTag
    const tag = Number(tagValue)
    const field = tag >>> 3
    const wire = tag & 7
    if (field === 0) break

    if (wire === 0) {
      const [value, afterValue] = readVarint(buffer, offset)
      offset = afterValue
      fields.push({ field, wire, varint: Number(value) })
    } else if (wire === 1) {
      if (offset + 8 > buffer.length) break
      offset += 8
      fields.push({ field, wire })
    } else if (wire === 2) {
      const [length, afterLength] = readVarint(buffer, offset)
      offset = afterLength
      const size = Number(length)
      if (offset + size > buffer.length) break
      fields.push({ field, wire, bytes: buffer.subarray(offset, offset + size) })
      offset += size
    } else if (wire === 5) {
      if (offset + 4 > buffer.length) break
      offset += 4
      fields.push({ field, wire })
    } else {
      break
    }
  }
  return fields
}

function varintAt(fields: ProtoField[], field: number): number | undefined {
  return fields.find((item) => item.field === field && item.wire === 0)?.varint
}

function bytesAt(fields: ProtoField[], field: number): Buffer | undefined {
  return fields.find((item) => item.field === field && item.wire === 2)?.bytes
}

function textAt(fields: ProtoField[], field: number): string {
  const bytes = bytesAt(fields, field)
  return bytes ? bytes.toString('utf8') : ''
}

function nestedAt(fields: ProtoField[], field: number): ProtoField[] | undefined {
  const bytes = bytesAt(fields, field)
  if (!bytes || bytes.length === 0) return undefined
  try {
    return readFields(bytes)
  } catch {
    return undefined
  }
}

export interface InteractWordV2 {
  uid: number
  uname: string
  face: string
  msgType: number
  roomId: number
  timestampSec: number
  medal?: { level: number; name: string; color?: string }
}

/** 最小 protobuf 解析，只取 INTERACT_WORD_V2 需要的字段。 */
export function decodeInteractWordV2(buffer: Buffer): InteractWordV2 | null {
  try {
    const top = readFields(buffer)
    const user = nestedAt(top, 22)
    const base = user ? nestedAt(user, 2) : undefined
    const medalFields = (user ? nestedAt(user, 3) : undefined) ?? nestedAt(top, 9)

    const uname = textAt(top, 2) || (base ? textAt(base, 1) : '')
    const uid = varintAt(top, 1) ?? (user ? varintAt(user, 1) : undefined) ?? 0
    const msgType = varintAt(top, 5) ?? 0
    const roomId = varintAt(top, 6) ?? 0
    const timestampSec = varintAt(top, 7) ?? 0
    const face = base ? textAt(base, 2) : ''

    const medalLevel = medalFields ? varintAt(medalFields, 2) : undefined
    const medalName = medalFields ? textAt(medalFields, 1) : ''
    const medalColor = medalFields ? textAt(medalFields, 15) : ''
    const medal =
      medalName
        ? { level: medalLevel ?? 0, name: medalName, color: medalColor || undefined }
        : undefined

    if (!uname && !uid && !msgType) return null
    return { uid, uname, face, msgType, roomId, timestampSec, medal }
  } catch {
    return null
  }
}
