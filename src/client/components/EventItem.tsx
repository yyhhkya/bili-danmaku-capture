import { Gift, SealCheck, SignIn, UserPlus } from '@phosphor-icons/react'
import { memo, useMemo } from 'react'

import type { NormalizedEvent } from '../../shared/types.js'
import { shanghaiTime } from '../../shared/time.js'
import { formatPrice, guardName, readableDanmakuColor } from '../lib/format.js'

const TYPE_BADGE: Partial<Record<NormalizedEvent['type'], string>> = {
  superchat: '醒目留言',
  gift: '礼物',
  guard: '上舰',
  enter: '进场',
  follow: '关注',
}

function TypeIcon({ type }: { type: NormalizedEvent['type'] }) {
  if (type === 'gift') return <Gift size={12} weight="regular" />
  if (type === 'guard') return <SealCheck size={12} weight="regular" />
  if (type === 'enter') return <SignIn size={12} weight="regular" />
  if (type === 'follow') return <UserPlus size={12} weight="regular" />
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 把 [{token}] 替换为 B 站表情图片，未匹配的 token 保持原文。 */
function EventContent({ event }: { event: NormalizedEvent }) {
  const parts = useMemo(() => {
    const emoticons = event.emoticons
    if (!emoticons) return null
    const tokens = Object.keys(emoticons).sort((a, b) => b.length - a.length)
    if (tokens.length === 0) return null
    const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'g')
    return event.text.split(pattern)
  }, [event.text, event.emoticons])

  if (!parts) return <>{event.text}</>

  return (
    <>
      {parts.map((part, index) => {
        const emoticon = event.emoticons?.[part]
        if (!emoticon) return <span key={index}>{part}</span>
        return (
          <img
            key={`${part}-${index}`}
            src={emoticon.url}
            alt={part}
            title={part}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="mx-0.5 inline-block h-[1.6em] w-auto max-w-[10em] align-[-0.35em] object-contain"
          />
        )
      })}
    </>
  )
}

export const EventItem = memo(function EventItem({ event }: { event: NormalizedEvent }) {
  const guard = guardName(event.user.guardLevel)
  const price = formatPrice(event.price)
  const isSuperChat = event.type === 'superchat'
  const isGift = event.type === 'gift'
  const isGuard = event.type === 'guard'
  const isPresence = event.type === 'enter' || event.type === 'follow'

  const rowClass = isSuperChat
    ? 'border-l-2 border-l-accent bg-accent/[0.05]'
    : isGuard
      ? 'border-l-2 border-l-accent/60 bg-accent/[0.03]'
      : isGift
        ? 'border-l-2 border-l-warn/40'
        : 'border-l-2 border-l-transparent'

  const textColor = isPresence
    ? 'text-zinc-500'
    : isSuperChat || isGift || isGuard
      ? 'text-zinc-200'
      : (readableDanmakuColor(event.color) ?? 'text-zinc-200')

  return (
    <div
      className={`feed-row feed-in flex gap-3 border-b border-line/50 px-3 py-2 sm:px-4 ${rowClass}`}
    >
      <time className="w-12 shrink-0 pt-0.5 font-mono text-[10px] leading-5 text-zinc-600 sm:w-14">
        {shanghaiTime(event.ts)}
      </time>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
          {event.user.medal ? (
            <span className="inline-flex items-center gap-1 rounded border border-line bg-ink-800 px-1 py-px text-[10px] text-zinc-400">
              {event.user.medal.color ? (
                <span
                  className="size-1 rounded-full"
                  style={{ backgroundColor: event.user.medal.color }}
                />
              ) : null}
              {event.user.medal.name}
              <span className="font-mono text-zinc-500">{event.user.medal.level}</span>
            </span>
          ) : null}

          {guard ? (
            <span className="rounded border border-accent/30 bg-accent-soft px-1 py-px text-[10px] text-accent">
              {guard}
            </span>
          ) : null}

          {event.user.isAdmin ? (
            <span className="rounded border border-line px-1 py-px text-[10px] text-zinc-500">
              房管
            </span>
          ) : null}

          <span className="font-medium text-zinc-300">{event.user.uname || '匿名用户'}</span>

          {event.type !== 'danmaku' ? (
            <span
              className={`inline-flex items-center gap-1 rounded px-1 py-px text-[10px] ${
                isSuperChat
                  ? 'bg-accent-soft text-accent'
                  : isGift
                    ? 'bg-warn/10 text-warn'
                    : 'bg-ink-800 text-zinc-500'
              }`}
            >
              <TypeIcon type={event.type} />
              {event.extra?.giftName && isGift
                ? `${event.extra.giftName} ×${event.extra.num ?? 1}`
                : (TYPE_BADGE[event.type] ?? '')}
            </span>
          ) : null}
        </div>

        <p className={`mt-0.5 break-words text-[13px] leading-relaxed ${textColor}`}>
          <EventContent event={event} />
          {isSuperChat && event.extra?.duration
            ? `（停留 ${event.extra.duration} 秒）`
            : ''}
        </p>
      </div>

      {price ? (
        <span className="shrink-0 self-start pt-0.5 font-mono text-[11px] text-accent">
          ¥{price}
        </span>
      ) : null}
    </div>
  )
})
