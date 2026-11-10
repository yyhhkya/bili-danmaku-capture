import { brotliDecompressSync, inflateRawSync, inflateSync } from 'node:zlib'

export const HEADER_SIZE = 16
const MAX_PACKET_SIZE = 16 * 1024 * 1024
const MAX_DEPTH = 3

export interface DecodedPacket {
  op: number
  protoVer: number
  seq: number
  body: Buffer
}

export interface ParseResult {
  packets: DecodedPacket[]
  rest: Buffer
}

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProtocolError'
  }
}

export function encodePacket(
  op: number,
  body: Buffer | string,
  protoVer = 1,
  seq = 1,
): Buffer {
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  const header = Buffer.alloc(HEADER_SIZE)
  header.writeUInt32BE(HEADER_SIZE + payload.length, 0)
  header.writeUInt16BE(HEADER_SIZE, 4)
  header.writeUInt16BE(protoVer, 6)
  header.writeUInt32BE(op, 8)
  header.writeUInt32BE(seq, 12)
  return Buffer.concat([header, payload])
}

function decompress(body: Buffer, protoVer: number): Buffer {
  try {
    if (protoVer === 2) {
      try {
        return inflateSync(body, { maxOutputLength: MAX_PACKET_SIZE })
      } catch {
        return inflateRawSync(body, { maxOutputLength: MAX_PACKET_SIZE })
      }
    }
    return brotliDecompressSync(body, { maxOutputLength: MAX_PACKET_SIZE })
  } catch {
    throw new ProtocolError(`解压失败（protoVer ${protoVer}）`)
  }
}

/** 解析流式 Buffer；尾部不完整的包留在 rest 中。压缩包会递归展开。 */
export function parsePackets(input: Buffer, depth = 0): ParseResult {
  if (depth > MAX_DEPTH) throw new ProtocolError('压缩包嵌套过深')

  const packets: DecodedPacket[] = []
  let offset = 0

  while (input.length - offset >= HEADER_SIZE) {
    const packetLen = input.readUInt32BE(offset)
    const headerLen = input.readUInt16BE(offset + 4)
    const protoVer = input.readUInt16BE(offset + 6)
    const op = input.readUInt32BE(offset + 8)
    const seq = input.readUInt32BE(offset + 12)

    if (packetLen < HEADER_SIZE || headerLen < HEADER_SIZE || headerLen > packetLen) {
      throw new ProtocolError('封包头不合法')
    }
    if (packetLen > MAX_PACKET_SIZE) throw new ProtocolError('封包超过大小上限')
    if (input.length - offset < packetLen) break

    const body = input.subarray(offset + headerLen, offset + packetLen)
    offset += packetLen

    if (protoVer === 2 || protoVer === 3) {
      const inflated = decompress(body, protoVer)
      const inner = parsePackets(inflated, depth + 1)
      packets.push(...inner.packets)
    } else {
      packets.push({ op, protoVer, seq, body: Buffer.from(body) })
    }
  }

  return { packets, rest: input.subarray(offset) }
}
