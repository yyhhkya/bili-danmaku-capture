import { ArrowRight, Eye, EyeSlash, WarningCircle } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useState, type FormEvent } from 'react'

import { MagneticButton } from '../components/ui/MagneticButton.js'

interface LoginPageProps {
  submitting: boolean
  error: string | null
  onLogin: (key: string) => Promise<boolean>
}

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
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-ink-950 px-5 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(90% 70% at 50% 0%, rgba(217, 120, 150, 0.12), transparent 60%)',
        }}
      />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        className="relative w-full max-w-sm"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          <label htmlFor="access-key" className="sr-only">
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
              aria-describedby={error ? 'access-key-error' : undefined}
              placeholder="访问密钥"
              className="h-12 w-full rounded-xl border border-line bg-ink-850 pl-4 pr-12 font-mono text-sm text-zinc-100 placeholder:font-sans placeholder:text-zinc-600 focus:border-accent focus:outline-none"
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

          {error ? (
            <p
              id="access-key-error"
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger"
            >
              <WarningCircle size={15} weight="regular" className="mt-px shrink-0" />
              {error}
            </p>
          ) : null}

          <MagneticButton
            type="submit"
            disabled={submitting || key.trim().length === 0}
            aria-busy={submitting}
            className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-ink-950 transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-accent-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '正在验证' : '进入监控台'}
            {submitting ? (
              <span className="size-1.5 animate-pulse rounded-full bg-ink-950" />
            ) : (
              <ArrowRight size={16} weight="bold" />
            )}
          </MagneticButton>
        </form>
      </motion.div>
    </div>
  )
}
