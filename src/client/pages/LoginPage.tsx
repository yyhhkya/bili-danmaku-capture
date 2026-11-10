import {
  ArrowRight,
  Broadcast,
  ChatCircleDots,
  Eye,
  EyeSlash,
  Gift,
  LockKey,
  SealCheck,
  WarningCircle,
} from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useState, type FormEvent } from 'react'

import { MagneticButton } from '../components/ui/MagneticButton.js'

interface LoginPageProps {
  submitting: boolean
  error: string | null
  onLogin: (key: string) => Promise<boolean>
}

const capabilities = [
  {
    icon: ChatCircleDots,
    label: '实时弹幕',
    detail: '多房间并发连接，按类型、关键词与用户过滤',
  },
  {
    icon: Gift,
    label: '关键事件',
    detail: '醒目留言、礼物与上舰单独标记，不淹没在滚动里',
  },
  {
    icon: SealCheck,
    label: 'B 站账号',
    detail: '网页扫码登录，Cookie 自动检查并续期',
  },
]

export function LoginPage({ submitting, error, onLogin }: LoginPageProps) {
  const [key, setKey] = useState('')
  const [visible, setVisible] = useState(false)
  const reduceMotion = useReducedMotion()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!key.trim() || submitting) return
    await onLogin(key)
  }

  return (
    <div className="grid min-h-[100dvh] grid-cols-1 bg-ink-950 lg:grid-cols-[1.15fr_0.85fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-ink-900 px-12 py-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 0% 0%, rgba(217, 120, 150, 0.14), transparent 55%), radial-gradient(80% 60% at 90% 100%, rgba(217, 120, 150, 0.08), transparent 60%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '88px 88px',
            maskImage: 'radial-gradient(ellipse at 20% 10%, black, transparent 70%)',
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
            <Broadcast size={20} weight="regular" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-zinc-100">弹幕监控</p>
            <p className="font-mono text-[11px] tracking-wide text-zinc-500">bili-danmaku-capture</p>
          </div>
        </div>

        <div className="relative max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
            live signal desk
          </p>
          <h1 className="mt-5 text-[clamp(2.2rem,4.2vw,3.8rem)] font-semibold leading-[1.04] tracking-tight text-zinc-100">
            盯住每一间直播间的
            <span className="text-accent">气氛</span>。
          </h1>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-zinc-400">
            把多个直播间的弹幕、醒目留言、礼物与上舰汇成一条可回看的时间线，
            连接状态、人气与消息速率都在视野里。
          </p>

          <div className="mt-12 border-t border-line">
            {capabilities.map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-4 border-b border-line py-5"
              >
                <span className="mt-0.5 text-zinc-500">
                  <item.icon size={18} weight="regular" />
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{item.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative font-mono text-[11px] tracking-wide text-zinc-600">
          WebSocket · JSONL · Asia/Shanghai
        </p>
      </aside>

      <section className="flex min-h-[100dvh] flex-col justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="mb-10 flex items-center gap-3 lg:hidden">
          <span className="grid size-9 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
            <Broadcast size={18} weight="regular" />
          </span>
          <p className="text-sm font-semibold tracking-tight text-zinc-100">弹幕监控</p>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          className="mx-auto w-full max-w-md"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            access control
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
            输入访问密钥
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            本站不设用户名。密钥保存在部署端的 <code className="font-mono text-xs text-zinc-300">.env</code> 中。
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-2" noValidate>
            <label htmlFor="access-key" className="text-xs font-medium text-zinc-300">
              访问密钥
            </label>
            <div className="relative">
              <input
                id="access-key"
                name="key"
                type={visible ? 'text' : 'password'}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                autoComplete="current-password"
                autoFocus
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'access-key-error' : 'access-key-help'}
                placeholder="粘贴或输入密钥"
                className="h-12 w-full rounded-xl border border-line bg-ink-850 pl-4 pr-12 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setVisible((value) => !value)}
                aria-label={visible ? '隐藏密钥' : '显示密钥'}
                className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-zinc-500 transition-colors hover:text-zinc-200"
              >
                {visible ? <EyeSlash size={18} weight="regular" /> : <Eye size={18} weight="regular" />}
              </button>
            </div>

            <p id="access-key-help" className="text-xs leading-relaxed text-zinc-600">
              登录状态保存在 httpOnly Cookie 中，有效期默认 7 天。
            </p>

            {error ? (
              <p
                id="access-key-error"
                role="alert"
                className="mt-1 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger"
              >
                <WarningCircle size={15} weight="regular" className="mt-px shrink-0" />
                {error}
              </p>
            ) : null}

            <MagneticButton
              type="submit"
              disabled={submitting || key.trim().length === 0}
              aria-busy={submitting}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-ink-950 transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-accent-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '正在验证' : '进入监控台'}
              {submitting ? (
                <span className="size-1.5 animate-pulse rounded-full bg-ink-950" />
              ) : (
                <ArrowRight size={16} weight="bold" />
              )}
            </MagneticButton>
          </form>

          <p className="mt-8 flex items-center gap-2 text-[11px] text-zinc-600">
            <LockKey size={13} weight="regular" />
            密钥与 B 站凭证只在服务端使用，不会进入浏览器。
          </p>
        </motion.div>
      </section>
    </div>
  )
}
