import { ArrowsClockwise, CaretDown, QrCode, SignOut, UserCircle } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import type { BiliRefreshResponse, BiliStatus } from '../../shared/types.js'
import { shanghaiDateTime } from '../../shared/time.js'

interface Props {
  status: BiliStatus | null
  loading: boolean
  onQrLogin: () => void
  onLogout: () => Promise<void>
  onRefreshCookie: () => Promise<BiliRefreshResponse>
}

function Avatar({ face, name }: { face: string | null | undefined; name: string | null | undefined }) {
  const validFace = face && /^https:\/\/[^/]*\.hdslb\.com\//.test(face)
  if (validFace) {
    return (
      <img
        src={face}
        alt=""
        referrerPolicy="no-referrer"
        className="size-7 rounded-full border border-line object-cover"
      />
    )
  }
  return (
    <span className="grid size-7 place-items-center rounded-full border border-line bg-ink-800 text-[11px] text-zinc-400">
      {(name?.trim().slice(0, 1) || 'B').toUpperCase()}
    </span>
  )
}

export function BiliAccountPanel({
  status,
  loading,
  onQrLogin,
  onLogout,
  onRefreshCookie,
}: Props) {
  const [open, setOpen] = useState(false)
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointer(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handlePointer)
    return () => window.removeEventListener('mousedown', handlePointer)
  }, [open])

  if (loading && !status) {
    return <div className="h-8 w-32 animate-pulse rounded-lg bg-ink-800" />
  }

  const loggedIn = Boolean(status?.loggedIn)
  const needsReauth =
    Boolean(status?.needsReauth) || Boolean(status && status.source !== 'none' && !loggedIn)

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!loggedIn) {
            onQrLogin()
            return
          }
          setOpen((value) => !value)
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-ink-850 py-1.5 pl-1.5 pr-2.5 text-xs text-zinc-300 transition-colors hover:border-line-strong hover:text-zinc-100 active:scale-[0.98]"
      >
        {loggedIn ? (
          <Avatar face={status?.face} name={status?.uname} />
        ) : (
          <span className="grid size-7 place-items-center rounded-full border border-line bg-ink-800 text-zinc-500">
            <UserCircle size={16} weight="regular" />
          </span>
        )}
        <span className="max-w-28 truncate">{loggedIn ? status?.uname || 'B 站已登录' : 'B 站未登录'}</span>
        <span
          className={`size-1.5 rounded-full ${loggedIn ? 'bg-live' : needsReauth ? 'bg-danger' : 'bg-warn'}`}
        />
        {loggedIn ? <CaretDown size={12} weight="bold" className="text-zinc-500" /> : null}
      </button>

      {open && loggedIn ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-ink-900 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium text-zinc-100">{status?.uname || 'B 站账号'}</p>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              UID {status?.uid ?? '—'} · {status?.source === 'qr' ? '网页扫码' : '环境变量兜底'}
            </p>
            {status?.updatedAt ? (
              <p className="mt-1 font-mono text-[11px] text-zinc-600">
                更新于 {shanghaiDateTime(status.updatedAt)}
              </p>
            ) : null}
            {status && !status.hasRefreshToken ? (
              <p className="mt-1 text-[11px] leading-relaxed text-warn">
                {status.source === 'env'
                  ? '环境变量兜底登录不含刷新令牌，Cookie 到期后需重新扫码'
                  : '本次登录未取得刷新令牌，Cookie 到期后需重新扫码'}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onQrLogin()
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-ink-800 hover:text-zinc-100"
            >
              <QrCode size={15} weight="regular" />
              重新扫码登录
            </button>
            <button
              type="button"
              disabled={refreshing}
              onClick={() => {
                setRefreshing(true)
                setRefreshMessage(null)
                void onRefreshCookie()
                  .then((result) => setRefreshMessage(result.message))
                  .catch((err: unknown) =>
                    setRefreshMessage(err instanceof Error ? err.message : '续期失败'),
                  )
                  .finally(() => setRefreshing(false))
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-ink-800 hover:text-zinc-100 disabled:opacity-50"
            >
              <ArrowsClockwise
                size={15}
                weight="regular"
                className={refreshing ? 'animate-spin' : undefined}
              />
              {refreshing ? '正在检查续期' : '检查并续期 Cookie'}
            </button>
            {refreshMessage ? (
              <p className="px-3 pb-2 text-[11px] leading-relaxed text-zinc-500">{refreshMessage}</p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (!confirmingLogout) {
                  setConfirmingLogout(true)
                  return
                }
                setConfirmingLogout(false)
                setOpen(false)
                void onLogout()
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10"
            >
              <SignOut size={15} weight="regular" />
              {confirmingLogout ? '再点一次确认退出' : '退出 B 站账号'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
