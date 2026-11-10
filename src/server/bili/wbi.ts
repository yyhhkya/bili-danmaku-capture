import { createHash } from 'node:crypto'

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
  28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
  54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

export interface WbiKeys {
  imgKey: string
  subKey: string
}

export function getMixinKey(imgKey: string, subKey: string): string {
  const raw = `${imgKey}${subKey}`
  return MIXIN_KEY_ENC_TAB.map((index) => raw[index] ?? '').join('').slice(0, 32)
}

/** 参数按键名排序、去掉 !'()*、encodeURIComponent 后拼接，再追加 w_rid。 */
export function signParams(
  params: Record<string, string | number | undefined>,
  keys: WbiKeys,
  wts = Math.floor(Date.now() / 1000),
): string {
  const merged: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) merged[key] = value
  }
  merged.wts = wts

  const query = Object.keys(merged)
    .sort()
    .map((key) => {
      const value = String(merged[key]).replace(/[!'()*]/g, '')
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    })
    .join('&')

  const wRid = createHash('md5').update(`${query}${getMixinKey(keys.imgKey, keys.subKey)}`).digest('hex')
  return `${query}&w_rid=${wRid}`
}

/** 从 nav 接口返回的伪图片地址中提取 img_key / sub_key。 */
export function extractWbiKeys(imgUrl: string, subUrl: string): WbiKeys {
  const fileName = (url: string): string => {
    const slash = url.lastIndexOf('/')
    const dot = url.lastIndexOf('.')
    return url.slice(slash + 1, dot > slash ? dot : undefined)
  }
  return { imgKey: fileName(imgUrl), subKey: fileName(subUrl) }
}
