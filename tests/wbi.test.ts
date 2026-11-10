import assert from 'node:assert/strict'
import test from 'node:test'

import { extractWbiKeys, getMixinKey, signParams } from '../src/server/bili/wbi.js'

const IMG_KEY = '7cd084941338484aae1ad9425b84077c'
const SUB_KEY = '4932caff0ff746eab6f01bf08b70ac45'

test('按文档示例重排得到 mixin_key', () => {
  assert.equal(getMixinKey(IMG_KEY, SUB_KEY), 'ea1db124af3c7062474693fa704f4ff8')
})

test('按文档示例生成排序后的签名参数', () => {
  const query = signParams(
    { foo: '114', bar: '514', zab: 1919810 },
    { imgKey: IMG_KEY, subKey: SUB_KEY },
    1702204169,
  )
  assert.equal(
    query,
    'bar=514&foo=114&wts=1702204169&zab=1919810&w_rid=8f6f2b5b3d485fe1886cec6a0be8c5d4',
  )
})

test('参数值去除 !\'()* 并使用 encodeURIComponent 编码', () => {
  const query = signParams(
    { foo: 'one one four', bar: '五一四', baz: 1919810, noisy: "a!b'c(d)e*f" },
    { imgKey: IMG_KEY, subKey: SUB_KEY },
    1702204169,
  )
  assert.match(
    query,
    /^bar=%E4%BA%94%E4%B8%80%E5%9B%9B&baz=1919810&foo=one%20one%20four&noisy=abcdef&wts=1702204169&w_rid=[0-9a-f]{32}$/,
  )
})

test('从伪图片地址提取 WBI key', () => {
  assert.deepEqual(
    extractWbiKeys(
      'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
      'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
    ),
    { imgKey: IMG_KEY, subKey: SUB_KEY },
  )
})
