import { BiliAccount } from '../src/server/bili/account.js'
import { BiliHttp } from '../src/server/bili/http.js'
import { LiveDanmakuClient } from '../src/server/bili/live-client.js'
import { fetchDanmuEndpoint, fetchRoomInfo } from '../src/server/bili/room.js'
import { BiliSessionStore } from '../src/server/bili/session.js'
import { loadConfig, loadDotEnv } from '../src/server/config.js'
import { createLogger } from '../src/server/logger.js'
import { shanghaiDateTime, shanghaiTime } from '../src/shared/time.js'

loadDotEnv()
const config = loadConfig()
const logger = createLogger('info')
const session = new BiliSessionStore(
  config.dataDir,
  config.sessionSecret,
  config.bili.cookie,
  logger,
)
const http = new BiliHttp(session, logger)
const account = new BiliAccount(session, http, logger)
await account.init()

const input = Number(process.argv[2] ?? 6)
const seconds = Number(process.argv[3] ?? 25)
if (!Number.isInteger(input) || input <= 0) {
  console.error('用法：npx tsx scripts/watch-room.ts <直播间号> [持续秒数]')
  process.exit(1)
}

const info = await fetchRoomInfo(http, input)
console.log(
  `监控 ${info.realRoomId}（${info.title}），直播状态 ${info.liveStatus}，持续 ${seconds} 秒，开始于 ${shanghaiDateTime()}`,
)

let count = 0
const client = new LiveDanmakuClient(info.realRoomId, {
  fetchEndpoint: (roomId) => fetchDanmuEndpoint(http, roomId),
  getUid: () => account.getUid(),
  onEvent: (event) => {
    count += 1
    const medal = event.user.medal ? `[${event.user.medal.name} ${event.user.medal.level}]` : ''
    console.log(
      `[${shanghaiTime(event.ts)}] ${event.type} ${event.user.uname}(${event.user.uid}) ${medal} ${event.text}`,
    )
  },
  onState: (state, detail) =>
    console.log(`[状态] ${state}${detail?.error ? ` - ${detail.error}` : ''}`),
  logger,
})

client.start()
setTimeout(() => {
  client.stop()
  console.log(`共收到 ${count} 条事件，结束于 ${shanghaiDateTime()}`)
  process.exit(0)
}, Math.max(5, seconds) * 1000)
