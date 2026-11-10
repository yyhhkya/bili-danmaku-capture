import fs from 'node:fs'
import http from 'node:http'
import express, { type NextFunction, type Request, type Response } from 'express'

import { loadConfig, loadDotEnv } from './config.js'
import { createLogger } from './logger.js'

loadDotEnv()

const config = loadConfig()
const logger = createLogger('info')

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '16kb' }))

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) })
})

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
  logger.info('正在关闭服务', { signal })
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
