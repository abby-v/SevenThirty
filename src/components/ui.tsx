import { useEffect, useState } from 'react'
import type { Kind } from '../engine/types.ts'

export function KindTag({ kind }: { kind: Kind }) {
  return (
    <span className={`tag ${kind}`}>
      <span className="tag-dot" aria-hidden="true" />
      {kind === 'standing' ? 'Standing' : 'Usage'}
    </span>
  )
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="var(--accent-text)" strokeWidth="2.2" />
      <path d="M16 9.5V16l-3.6 3.6" fill="none" stroke="var(--accent-text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 16v6.5" stroke="var(--accent-text)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** Polite screen reader announcements, debounced so typing does not flood them. */
export function LiveAnnouncer({ message, delay = 900 }: { message: string; delay?: number }) {
  const [said, setSaid] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSaid(message), delay)
    return () => clearTimeout(t)
  }, [message, delay])
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {said}
    </div>
  )
}

export function Toast({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite">
      {message && <div className="toast">{message}</div>}
    </div>
  )
}

/** Number input that lets people clear the box while typing without snapping to 0. */
export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step,
  className = 'input',
  describedBy,
  label,
}: {
  id?: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  describedBy?: string
  label?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    if (Number(text) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      id={id}
      className={className}
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step ?? 'any'}
      aria-describedby={describedBy}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value !== '' && Number.isFinite(n)) onChange(max !== undefined ? Math.min(max, n) : n)
      }}
      onBlur={() => {
        if (text === '' || !Number.isFinite(Number(text))) setText(String(value))
      }}
    />
  )
}
