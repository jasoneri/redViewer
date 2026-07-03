import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Check, LoaderCircle, Save } from 'lucide-react'

export type ConfDrawerSaveFeedback = 'idle' | 'check' | 'fading'

export function useConfDrawerSaveFeedback() {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<ConfDrawerSaveFeedback>('idle')
  const feedbackTimers = useRef<number[]>([])

  const clearFeedbackTimers = () => {
    feedbackTimers.current.forEach((timer) => window.clearTimeout(timer))
    feedbackTimers.current = []
  }

  const showCompleteFeedback = () => {
    clearFeedbackTimers()
    setFeedback('check')
    feedbackTimers.current = [
      window.setTimeout(() => setFeedback('fading'), 1500),
      window.setTimeout(() => setFeedback('idle'), 1800),
    ]
  }

  const runWithFeedback = async <T,>(
    action: () => T | Promise<T>,
    options: {
      minimumBusyMs?: number
      shouldShowComplete?: (result: T) => boolean
    } = {},
  ): Promise<T> => {
    clearFeedbackTimers()
    setFeedback('idle')
    setBusy(true)
    const startedAt = Date.now()
    try {
      const result = await action()
      const waitMs = Math.max((options.minimumBusyMs || 0) - (Date.now() - startedAt), 0)
      if (waitMs > 0) {
        await new Promise<void>((resolve) => {
          feedbackTimers.current.push(window.setTimeout(resolve, waitMs))
        })
      }
      if (options.shouldShowComplete?.(result) ?? result !== false) showCompleteFeedback()
      return result
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => () => clearFeedbackTimers(), [])

  return {
    busy,
    feedback,
    runWithFeedback,
    showCompleteFeedback,
  }
}

export function ConfDrawerSaveButton({
  busy,
  className = 'icon-only cgs-conf-header-save',
  disabled,
  feedback,
  iconSize = 18,
  ...buttonProps
}: {
  busy: boolean
  className?: string
  disabled?: boolean
  feedback: ConfDrawerSaveFeedback
  iconSize?: number
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'disabled'>) {
  const icon = busy
    ? <LoaderCircle className="spin" size={iconSize} />
    : feedback === 'idle'
      ? <Save size={iconSize} />
      : <Check className={`cgs-save-check${feedback === 'fading' ? ' is-fading' : ''}`} size={iconSize} />

  return (
    <button
      {...buttonProps}
      type={buttonProps.type || 'button'}
      className={className}
      disabled={disabled || busy}
    >
      {icon}
    </button>
  )
}
