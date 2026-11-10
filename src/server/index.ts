import fs from 'node:fs'
import http from 'node:http'
import express, { type NextFunction, type Request, type Response } from 'express'

import { LoginRateLimiter, requireAuth } from './auth.js'
import { BiliAccount } from './bili/account.js'
import { CookieRefreshService } from './bili/cookie-refresh.js'
import { BiliHttp } from './bili/http.js'
import { QrLoginService } from './bili/qr-login.js'
import { BiliSessionStore } from './bili/session.js'
import { loadConfig, loadDotEnv } from './config.js'
import { createLogger } from './logger.js'
import { createAuthRouter } from './routes/auth.js'
import { createBiliRouter } from './routes/bili.js'

loadDotEnv()

const config = loadConfig()
const logger = createLogger('info')

const app = express()
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
app.use(express.json({ limit: '16kb' }))

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) })
})

const loginLimiter = new LoginRateLimiter()
app.use('/api/auth', createAuthRouter(config, loginLimiter, logger))
app.use('/api', requireAuth(config.sessionSecret))

const biliSession = new BiliSessionStore(
  config.dataDir,
  config.sessionSecret,
  config.bili.cookie,
  logger,
)
const biliHttp = new BiliHttp(biliSession, logger)
const biliAccount = new BiliAccount(biliSession, biliHttp, logger)
const qrLogin = new QrLoginService(biliHttp, biliAccount, logger)
const cookieRefresh = new CookieRefreshService(biliSession, biliHttp, logger)

void biliAccount
  .init()
  .then(() => {
    const status = biliAccount.status()
    logger.info('B 站账号状态', { loggedIn: status.loggedIn, source: status.source })
  })
  .catch((error: unknown) => {
    logger.error('初始化 B 站会话失败', {
      reason: error instanceof Error ? error.message : '未知错误',
    })
  })

cookieRefresh.start(config.bili.refreshCheckMs)

app.use('/api/bili', createBiliRouter(biliAccount, qrLogin, cookieRefresh))

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } })
})

const hasClientBuild = fs.existsSync(config.clientDir)
if (hasClientBuild) {
  app.use(express.static(config.clientDir, { index: false }))
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      next()
      return
    }
    res.sendFile('index.html', { root: config.clientDir })
  })
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: '请求体格式错误' } })
    return
  }
  const message = error instanceof Error ? error.message : '未知错误'
  logger.error('请求处理失败', { message })
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } })
})

const server = http.createServer(app)

server.listen(config.port, config.host, () => {
  logger.info('服务已启动', {
    url: `http://${config.host}:${config.port}`,
    client: hasClientBuild ? '已托管构建产物' : '开发模式，请使用 Vite',
  })
})

let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  cookieRefresh.stop()
  logger.info('正在关闭服务', { signal })
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
