import { useEffect, useRef, useState } from 'react'

type Props = {
  lowLabel: string
  highLabel: string
  low: number
  high: number
  min: number
  max: number
  step: number
  /** Fires on every movement, so a readout can follow the thumb. */
  onDrag?: (range: { low: number; high: number }) => void
  onCommit: (range: { low: number; high: number }) => void
}

/**
 * One track with both ends on it. Dragging reports every movement through
 * `onDrag` so the numbers beside it keep up, but only writes through `onCommit`
 * once the drag ends, so a sweep does not fire a navigation per pixel.
 *
 * Where the two thumbs sit on top of each other the pointer would always reach
 * the same one, so a press first decides which input to raise based on the thumb
 * it landed nearest.
 */
export function DualRangeSlider({
  lowLabel,
  highLabel,
  low,
  high,
  min,
  max,
  step,
  onDrag,
  onCommit,
}: Props) {
  const [draft, setDraft] = useState({ low, high })
  const [onTop, setOnTop] = useState<'low' | 'high'>('high')
  const dragging = useRef(false)

  useEffect(() => {
    if (!dragging.current) setDraft({ low, high })
  }, [low, high])

  const percent = (value: number) => ((value - min) / (max - min)) * 100

  const commit = () => {
    dragging.current = false
    if (draft.low !== low || draft.high !== high) onCommit(draft)
  }

  const update = (end: 'low' | 'high', value: number) => {
    dragging.current = true
    // The ends may meet but never cross.
    const next =
      end === 'low'
        ? { low: Math.min(value, draft.high), high: draft.high }
        : { low: draft.low, high: Math.max(value, draft.low) }
    setDraft(next)
    onDrag?.(next)
  }

  const shared = {
    type: 'range' as const,
    min,
    max,
    step,
    className: 'dual-range',
    onPointerUp: commit,
    onKeyUp: commit,
    onBlur: commit,
  }

  return (
    <div
      className="relative h-4 w-56"
      onPointerDown={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        const at = min + ((event.clientX - box.left) / box.width) * (max - min)
        setOnTop(Math.abs(at - draft.low) <= Math.abs(at - draft.high) ? 'low' : 'high')
      }}
    >
      <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-line" />
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-amber"
        style={{
          left: `${percent(draft.low)}%`,
          width: `${percent(draft.high) - percent(draft.low)}%`,
        }}
      />
      <input
        {...shared}
        aria-label={lowLabel}
        value={draft.low}
        style={{ zIndex: onTop === 'low' ? 3 : 2 }}
        onChange={(e) => update('low', e.target.valueAsNumber)}
      />
      <input
        {...shared}
        aria-label={highLabel}
        value={draft.high}
        style={{ zIndex: onTop === 'high' ? 3 : 2 }}
        onChange={(e) => update('high', e.target.valueAsNumber)}
      />
    </div>
  )
}
