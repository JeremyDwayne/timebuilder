import { useEffect, useId, useRef, useState } from 'react'

type Props = {
  /** Omitted when the caller renders its own label beside another control. */
  label?: string
  value: number
  /** Arrow-key increment. Also the rounding used when stepping. */
  step: number
  min?: number
  max?: number
  /** Trailing unit shown inside the field, e.g. "kt". */
  suffix?: string
  width?: string
  onCommit: (value: number) => void
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/**
 * A text field that only reports a value once editing has settled, so typing
 * "0.5" does not navigate through "0" on the way. Committed on blur or Enter,
 * and stepped with the arrow keys.
 */
export function NumberField({
  label,
  value,
  step,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  suffix,
  width = 'w-20',
  onCommit,
}: Props) {
  const id = useId()
  const [text, setText] = useState(() => String(value))
  const editing = useRef(false)

  // Adopt values that changed elsewhere, e.g. back/forward, unless mid-edit.
  useEffect(() => {
    if (!editing.current) setText(String(value))
  }, [value])

  const parse = (raw: string) => {
    const parsed = Number(raw.trim())
    return raw.trim() !== '' && Number.isFinite(parsed) ? clamp(parsed, min, max) : null
  }

  const commit = () => {
    editing.current = false
    const parsed = parse(text)
    if (parsed === null) {
      setText(String(value))
      return
    }
    setText(String(parsed))
    if (parsed !== value) onCommit(parsed)
  }

  const nudge = (direction: 1 | -1) => {
    const base = parse(text) ?? value
    // Snap to the step grid so repeated presses stay on round numbers.
    const next = clamp(
      Math.round((base + direction * step) / step) * step,
      min,
      max,
    )
    const rounded = Number(next.toFixed(4))
    setText(String(rounded))
    editing.current = false
    if (rounded !== value) onCommit(rounded)
  }

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block font-mono text-xs text-muted">
          {label}
        </label>
      )}
      <div className={`relative ${label ? 'mt-1' : ''}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          className={`${width} rounded border border-line bg-ink-800 px-2 py-1.5 font-mono text-sm ${suffix ? 'pr-7' : ''}`}
          onChange={(e) => {
            editing.current = true
            setText(e.target.value)
          }}
          onFocus={(e) => {
            editing.current = true
            e.target.select()
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget.blur(), commit())
            if (e.key === 'Escape') (setText(String(value)), (editing.current = false))
            if (e.key === 'ArrowUp') (e.preventDefault(), nudge(1))
            if (e.key === 'ArrowDown') (e.preventDefault(), nudge(-1))
          }}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}
