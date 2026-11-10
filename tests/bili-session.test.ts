import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { BiliSessionStore } from '../src/server/bili/session.js'
import { createLogger } from '../src/server/logger.js'

const silent = createLogger('error')
const SECRET = 's'.repeat(32)

test('B 站会话加密落盘，可解密还原且不出现明文凭证', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bdc-session-'))
  try {
    const store = new BiliSessionStore(dir, SECRET, '', silent)
    store.setSource('qr')
    store.setCookie('SESSDATA', 'secret-sessdata')
    store.setCookie('bili_jct', 'secret-jct')
    store.setRefreshToken('refresh-token-value')
    store.setIdentity(42, '测试用户', 'https://i0.hdslb.com/bfs/face/x.jpg')
    store.touch()
    assert.equal(store.snapshot().loggedIn, true)
    await store.persist()

    const raw = await fs.promises.readFile(path.join(dir, 'bili-session.json'), 'utf8')
    assert.equal(raw.includes('secret-sessdata'), false)
    assert.equal(raw.includes('refresh-token-value'), false)

    const loaded = new BiliSessionStore(dir, SECRET, '', silent)
    await loaded.load()
    assert.equal(loaded.get('SESSDATA'), 'secret-sessdata')
    assert.equal(loaded.getRefreshToken(), 'refresh-token-value')
    assert.equal(loaded.snapshot().uname, '测试用户')
    assert.equal(loaded.snapshot().source, 'qr')
    assert.equal(loaded.snapshot().loggedIn, true)

    const wrongSecret = new BiliSessionStore(dir, 'x'.repeat(32), '', silent)
    await wrongSecret.load()
    assert.equal(wrongSecret.hasSession(), false)
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
})

test('没有会话文件时回退到 .env Cookie', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bdc-env-'))
  try {
    const store = new BiliSessionStore(
      dir,
      SECRET,
      'SESSDATA=env-cookie; buvid3=env-buvid3',
      silent,
    )
    await store.load()
    assert.equal(store.get('SESSDATA'), 'env-cookie')
    assert.equal(store.get('buvid3'), 'env-buvid3')
    assert.equal(store.snapshot().source, 'env')
    assert.equal(store.snapshot().loggedIn, true)
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
})
