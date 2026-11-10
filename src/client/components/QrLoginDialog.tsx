import { ArrowClockwise, CheckCircle, WarningCircle, X } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import type {
  BiliQrPollResponse,
  BiliQrStartResponse,
  BiliStatus,
} from '../../shared/types.js'
import { ApiError } from '../api.js'

type Phase = 'loading' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error'

interface Props {
  open: boolean
  onClose: () => void
  startQr: () => Promise<BiliQrStartResponse>
  pollQr: (handle: string) => Promise<BiliQrPollResponse>
  onAccountUpdated: (status: BiliStatus) => void
}

export function QrLoginDialog({ open, onClose, startQr, pollQr, onAccountUpdated }: Props) {
  const reduceMotion = useReducedMotion()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [reload, setReload] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [image, setImage] = useState<string | null>(null)
  const [handle, setHandle] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [message, setMessage] = useState('正在获取二维码')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!open) return
    let cancelled = false

    setPhase('loading')
    setImage(null)
    setHandle(null)
    setExpiresAt(null)
    setMessage('正在获取二维码')
    setError(null)

    void startQr()
      .then((result) => {
        if (cancelled) return
        setImage(result.image)
        setHandle(result.handle)
        setExpiresAt(result.expiresAt)
        setMessage('打开 B 站手机客户端扫码')
        setPhase('waiting')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : '二维码获取失败')
        setPhase('error')
      })

    return () => {
      cancelled = true
    }
  }, [open, startQr, reload])

  useEffect(() => {
    if (!open || !handle) return
    let cancelled = false
    let busy = false

    async function tick() {
      if (busy) return
      busy = true
      try {
        const result = await pollQr(handle as string)
        if (cancelled) return
        setMessage(result.message)
        if (result.status === 'success') {
          setPhase('success')
          setHandle(null)
          if (result.account) onAccountUpdated(result.account)
          // 不依赖 effect 的 cancelled 标记：设置 handle 为 null 会立即触发清理，
          // 若在这里判断 cancelled，弹窗会永远停在成功态。
          window.setTimeout(() => onCloseRef.current(), 900)
        } else if (result.status === 'expired') {
          setPhase('expired')
          setHandle(null)
        } else if (result.status === 'error') {
          setError(result.message)
          setPhase('error')
          setHandle(null)
        } else if (result.status === 'scanned') {
          setPhase('scanned')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : '扫码状态查询失败')
          setPhase('error')
          setHandle(null)
        }
      } finally {
        busy = false
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, handle, pollQr, onClose, onAccountUpdated])

  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const remaining = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-950/85 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-login-title"
            onClick={(event) => event.stopPropagation()}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            className="w-full max-w-sm rounded-2xl border border-line bg-ink-900 p-6 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">bilibili</p>
                <h2 id="qr-login-title" className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">
                  扫码登录 B 站
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="grid size-8 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-ink-800 hover:text-zinc-200"
                autoFocus
              >
                <X size={16} weight="regular" />
              </button>
            </div>

            <div className="mt-6 grid place-items-center">
              <div className="grid size-[280px] place-items-center rounded-xl border border-line bg-ink-850 p-1">
                {image ? (
                  <img
                    src={image}
                    alt="B 站登录二维码"
                    className={`size-full rounded-lg object-contain transition-opacity ${
                      phase === 'success' ? 'opacity-30' : 'opacity-100'
                    }`}
                  />
                ) : (
                  <div className="size-full animate-pulse rounded-lg bg-ink-800" />
                )}
              </div>
            </div>

            <div className="mt-5 min-h-10 text-center">
              {phase === 'success' ? (
                <p className="inline-flex items-center gap-2 text-sm text-live">
                  <CheckCircle size={16} weight="regular" />
                  登录成功，正在同步账号信息
                </p>
              ) : phase === 'error' ? (
                <p role="alert" className="inline-flex items-start gap-2 text-xs leading-relaxed text-danger">
                  <WarningCircle size={15} weight="regular" className="mt-px shrink-0" />
                  {error ?? '扫码登录失败'}
                </p>
              ) : (
                <p className="text-sm text-zinc-400">{message}</p>
              )}
              {phase === 'waiting' || phase === 'scanned' ? (
                <p className="mt-1 font-mono text-[11px] text-zinc-600">
                  {remaining !== null ? `二维码剩余 ${remaining} 秒` : '二维码 180 秒内有效'}
                </p>
              ) : null}
            </div>

            {phase === 'expired' || phase === 'error' ? (
              <button
                type="button"
                onClick={() => setReload((value) => value + 1)}
                className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm text-zinc-300 transition-colors hover:border-line-strong hover:text-zinc-100 active:scale-[0.98]"
              >
                <ArrowClockwise size={16} weight="regular" />
                刷新二维码
              </button>
            ) : null}

            <p className="mt-5 text-center text-[11px] leading-relaxed text-zinc-600">
              打开 B 站手机客户端，点击右上角扫一扫。
              登录凭证只保存在服务端并加密存储。
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
