import { WarningCircle } from '@phosphor-icons/react'

import type { BiliStatus } from '../../shared/types.js'

interface Props {
  status: BiliStatus | null
  onLogin: () => void
}

export function StatusBanner({ status, onLogin }: Props) {
  if (!status || status.loggedIn) return null

  const text = status.needsReauth
    ? 'B 站登录已失效，弹幕昵称与 UID 会被打码'
    : 'B 站未登录，弹幕昵称与 UID 会被打码'

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-warn/20 bg-warn/[0.06] px-5 py-2.5 text-xs text-warn sm:px-8"
    >
      <span className="inline-flex items-center gap-2">
        <WarningCircle size={15} weight="regular" />
        {text}
      </span>
      <button
        type="button"
        onClick={onLogin}
        className="rounded-md border border-warn/30 px-2.5 py-1 text-[11px] text-warn transition-colors hover:bg-warn/10 active:scale-[0.98]"
      >
        扫码登录
      </button>
    </div>
  )
}
