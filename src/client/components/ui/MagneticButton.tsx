import { motion, useMotionValue, useReducedMotion, useSpring, type HTMLMotionProps } from 'motion/react'
import type { ReactNode } from 'react'

type Props = HTMLMotionProps<'button'> & { children: ReactNode }

/** 轻微向指针靠拢的主按钮；使用 MotionValue，避免触发 React 重渲染。 */
export function MagneticButton({ children, disabled, ...rest }: Props) {
  const reduceMotion = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 260, damping: 20, mass: 0.4 })
  const springY = useSpring(y, { stiffness: 260, damping: 20, mass: 0.4 })

  return (
    <motion.button
      {...rest}
      disabled={disabled}
      style={{ x: reduceMotion ? 0 : springX, y: reduceMotion ? 0 : springY }}
      onPointerMove={(event) => {
        if (reduceMotion || disabled) return
        const rect = event.currentTarget.getBoundingClientRect()
        x.set((event.clientX - rect.left - rect.width / 2) * 0.06)
        y.set((event.clientY - rect.top - rect.height / 2) * 0.12)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.button>
  )
}
