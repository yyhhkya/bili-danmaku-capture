import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractEmoticonObject,
  fetchRecentEmoticons,
  parseEmoticonPackages,
  type JsonHttp,
} from '../src/server/bili/emoticons.js'

const TOKEN = '[哈基蜜集_露出鲨头]'
const URL = 'https://i0.hdslb.com/bfs/garb/af63d93470d365b486439ddd04a010d87cf7ad1d.png'

test('解析只有 emoticon_unique 的表情对象', () => {
  const result = extractEmoticonObject({
    emoticon_unique: `upower_${TOKEN}`,
    url: 'http://i0.hdslb.com/bfs/garb/af63d93470d365b486439ddd04a010d87cf7ad1d.png',
    width: 20,
    height: 20,
  })
  assert.ok(result)
  assert.equal(result[0], TOKEN)
  assert.equal(result[1].url, URL)
})

test('从历史弹幕中汇总 UP 主/装扮表情', async () => {
  const http: JsonHttp = {
    async getJson<T>(): Promise<T> {
      return {
        code: 0,
        data: {
          admin: [],
          room: [
            {
              text: TOKEN,
              emots: null,
              emoticon: {
                text: TOKEN,
                emoticon_unique: `upower_${TOKEN}`,
                url: URL,
                width: 20,
                height: 20,
              },
            },
            {
              text: '普通弹幕[热]',
              emoticon: null,
              emots: {
                '[热]': {
                  url: 'http://i0.hdslb.com/bfs/live/hot.png',
                  width: 20,
                  height: 20,
                },
              },
            },
            {
              text: '非法地址[坏]',
              emoticon: {
                text: '[坏]',
                url: 'https://evil.example/x.png',
              },
            },
          ],
        },
      } as T
    },
  }

  const map = await fetchRecentEmoticons(http, 1888546382)
  assert.equal(map[TOKEN]?.url, URL)
  assert.equal(map['[热]']?.url, 'https://i0.hdslb.com/bfs/live/hot.png')
  assert.equal(map['[坏]'], undefined)
})

test('解析房间表情包，补方括号、升级 https 并优先 UP主大表情', () => {
  const map = parseEmoticonPackages({
    code: 0,
    data: {
      data: [
        {
          pkg_name: 'emoji',
          emoticons: [{ emoji: '[dog]', url: 'http://i0.hdslb.com/bfs/live/dog.png', width: 20, height: 20 }],
        },
        {
          pkg_name: '房间专属表情',
          emoticons: [
            { emoji: '有趣', url: 'http://i0.hdslb.com/bfs/live/room-a.png', width: 162, height: 162 },
            { emoji: '烧烤中', url: 'http://i0.hdslb.com/bfs/live/room-b.png', width: 162, height: 162 },
          ],
        },
        {
          pkg_name: 'UP主大表情',
          emoticons: [
            { emoji: '烧烤中', url: 'https://i0.hdslb.com/bfs/garb/up-b.png', width: 162, height: 162 },
            { emoji: '坏地址', url: 'https://evil.example/x.png' },
          ],
        },
      ],
    },
  })

  assert.equal(map['[dog]']?.url, 'https://i0.hdslb.com/bfs/live/dog.png')
  assert.equal(map['[有趣]']?.url, 'https://i0.hdslb.com/bfs/live/room-a.png')
  assert.equal(map['[有趣]']?.width, 162)
  // 同名 token 以 UP主大表情 为准
  assert.equal(map['[烧烤中]']?.url, 'https://i0.hdslb.com/bfs/garb/up-b.png')
  assert.equal(map['[坏地址]'], undefined)
})

test('表情包解析对异常结构返回空字典', () => {
  assert.deepEqual(parseEmoticonPackages(null), {})
  assert.deepEqual(parseEmoticonPackages({ code: 0, data: { data: 'oops' } }), {})
})
