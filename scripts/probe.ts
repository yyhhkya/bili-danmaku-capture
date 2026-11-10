import { BiliHttp } from '../src/server/bili/http.js'
import { fetchAnchorInfo, fetchDanmuEndpoint, fetchRoomInfo } from '../src/server/bili/room.js'
import { BiliSessionStore } from '../src/server/bili/session.js'
import { loadConfig, loadDotEnv } from '../src/server/config.js'
import { createLogger } from '../src/server/logger.js'
import { shanghaiDateTime } from '../src/shared/time.js'

loadDotEnv()
const config = loadConfig()
const logger = createLogger('info')
const session = new BiliSessionStore(
  config.dataDir,
  config.sessionSecret,
  config.bili.cookie,
  logger,
)
await session.load()
const http = new BiliHttp(session, logger)

const roomId = Number(process.argv[2] ?? 6)
if (!Number.isInteger(roomId) || roomId <= 0) {
  console.error('用法：npx tsx scripts/probe.ts <直播间号>')
  process.exit(1)
}

console.log(`探测直播间 ${roomId}（北京时间 ${shanghaiDateTime()}）`)
console.log('Cookie：', session.hasSession() ? '已登录 B 站' : '匿名模式')

try {
  const room = await fetchRoomInfo(http, roomId)
  console.log('房间信息：', {
    真实房间号: room.realRoomId,
    短号: room.shortId,
    标题: room.title,
    直播状态: room.liveStatus,
    'get_info.online': room.online,
    分区: room.areaName,
  })

  const anchor = await fetchAnchorInfo(http, room.realRoomId)
  console.log('主播信息：', anchor ?? '（获取失败，不影响弹幕连接）')

  await http.ensureBuvid3()
  const endpoint = await fetchDanmuEndpoint(http, room.realRoomId)
  console.log('弹幕服务器：', {
    节点数: endpoint.hosts.length,
    第一个节点: endpoint.hosts[0],
    token长度: endpoint.token.length,
  })
} catch (error) {
  console.error('探测失败：', error instanceof Error ? error.message : error)
  process.exitCode = 1
}
