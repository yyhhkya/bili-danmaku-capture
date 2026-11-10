import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  CookieRefreshService,
  buildCorrespondPath,
  parseRefreshCsrf,
  type HttpLike,
} from '../src/server/bili/cookie-refresh.js'
import { BiliSessionStore } from '../src/server/bili/session.js'
import { createLogger } from '../src/server/logger.js'

const silent = createLogger('error')
const SECRET = 's'.repeat(32)

test('CorrespondPath 是 1024 位 RSA-OAEP 的小写十六进制', () => {
  const result = buildCorrespondPath(1_700_000_000_000)
  assert.match(result, /^[0-9a-f]{256}$/)
})

test('从对应页面解析 refresh_csrf', () => {
  assert.equal(
    parseRefreshCsrf('<html><body><div id="1-name">b0cc8411ded2</div></body></html>'),
    'b0cc8411ded2',
  )
  assert.equal(parseRefreshCsrf('<div>没有口令</div>'), null)
})

async function withSessionDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bdc-refresh-'))
  try {
    await fn(dir)
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
}

test('需要刷新时依次完成 refresh 与 confirm，并轮换 refresh_token', async () => {
  await withSessionDir(async (dir) => {
    const session = new BiliSessionStore(dir, SECRET, '', silent)
    session.setSource('qr')
    session.setCookie('SESSDATA', 'sessdata-value')
    session.setCookie('bili_jct', 'old-csrf')
    session.setRefreshToken('old-token')
    session.touch()
    await session.persist()

    const http: HttpLike = {
      async request(url, init) {
        assert.match(url, /\/correspond\/1\/[0-9a-f]{256}$/)
        assert.equal(new Headers(init?.headers).get('Referer'), 'https://www.bilibili.com/')
        return new Response('<div id="1-name">refresh-csrf-123</div>', { status: 200 })
      },
      async getJson<T>(url: string, init?: RequestInit): Promise<T> {
        if (url.includes('/cookie/info')) {
          return { code: 0, data: { refresh: true, timestamp: 1_700_000_000_000 } } as T
        }
        const body = new URLSearchParams(String(init?.body ?? ''))
        if (url.endsWith('/cookie/refresh')) {
          assert.equal(body.get('csrf'), 'old-csrf')
          assert.equal(body.get('refresh_csrf'), 'refresh-csrf-123')
          assert.equal(body.get('source'), 'main_web')
          assert.equal(body.get('refresh_token'), 'old-token')
          session.setCookie('bili_jct', 'new-csrf')
          return { code: 0, data: { status: 0, refresh_token: 'new-token' } } as T
        }
        if (url.endsWith('/confirm/refresh')) {
          assert.equal(body.get('csrf'), 'new-csrf')
          assert.equal(body.get('refresh_token'), 'old-token')
          return { code: 0 } as T
        }
        throw new Error(`未预期的请求：${url}`)
      },
    }

    const service = new CookieRefreshService(session, http, silent, 0)
    const result = await service.run(true)

    assert.equal(result.status, 'refreshed')
    assert.equal(session.getRefreshToken(), 'new-token')
    assert.equal(session.get('bili_jct'), 'new-csrf')
    assert.equal(session.snapshot().needsReauth, false)
  })
})

test('无需刷新时保持原状', async () => {
  await withSessionDir(async (dir) => {
    const session = new BiliSessionStore(dir, SECRET, '', silent)
    session.setSource('qr')
    session.setCookie('SESSDATA', 'sessdata-value')
    session.setCookie('bili_jct', 'csrf')
    session.setRefreshToken('token')

    const http: HttpLike = {
      async request() {
        throw new Error('不应请求对应页面')
      },
      async getJson<T>(): Promise<T> {
        return { code: 0, data: { refresh: false, timestamp: Date.now() } } as T
      },
    }

    const service = new CookieRefreshService(session, http, silent, 0)
    const result = await service.run(true)
    assert.equal(result.status, 'fresh')
    assert.equal(session.getRefreshToken(), 'token')
  })
})

test('Cookie 失效时标记需要重新扫码', async () => {
  await withSessionDir(async (dir) => {
    const session = new BiliSessionStore(dir, SECRET, '', silent)
    session.setSource('qr')
    session.setCookie('SESSDATA', 'sessdata-value')
    session.setCookie('bili_jct', 'csrf')
    session.setRefreshToken('token')
    await session.persist()

    const http: HttpLike = {
      async request() {
        throw new Error('不应请求对应页面')
      },
      async getJson<T>(): Promise<T> {
        return { code: -101, message: '账号未登录' } as T
      },
    }

    const service = new CookieRefreshService(session, http, silent, 0)
    const result = await service.run(true)
    assert.equal(result.status, 'needs-reauth')
    assert.equal(session.snapshot().needsReauth, true)

    const reloaded = new BiliSessionStore(dir, SECRET, '', silent)
    await reloaded.load()
    assert.equal(reloaded.snapshot().needsReauth, true)
  })
})
