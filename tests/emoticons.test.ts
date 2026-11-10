import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractEmoticonObject,
  fetchRecentEmoticons,
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
