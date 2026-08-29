import { useEffect, useMemo, useRef, useState } from 'react'

import type { Leg } from '~/lib/airport'
import { hashSeed, sample, seededRandom } from '~/lib/sample'

const SLOTS = 12
const RADIUS = 92
const LABEL_RADIUS = 64
const SPIN_MS = 4200
const SPIN_TURNS = 5

type Props = {
  legs: ReadonlyArray<Leg>
  /** Stable seed from the search params, so server and client draw the same wheel. */
  seed: string
  /** Destination already chosen in the URL, kept under the pointer on load. */
  pick?: string
  onLand: (leg: Leg) => void
}

/** Point on the wheel rim, measuring degrees clockwise from twelve o'clock. */
function rim(angleDeg: number, radius: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [radius * Math.cos(a), radius * Math.sin(a)] as const
}

function segmentPath(index: number, count: number) {
  const step = 360 / count
  const [x1, y1] = rim(index * step, RADIUS)
  const [x2, y2] = rim((index + 1) * step, RADIUS)
  return `M 0 0 L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RADIUS} ${RADIUS} 0 ${step > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
}

/** Rotation that parks the given slot under the pointer, after whole turns. */
function restingAngle(index: number, count: number, turns: number) {
  const step = 360 / count
  return turns * 360 - (index * step + step / 2)
}

export function Wheel({ legs, seed, pick, onLand }: Props) {
  const [reshuffles, setReshuffles] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const slots = useMemo(() => {
    const random = seededRandom(hashSeed(seed) + reshuffles * 7919)
    const drawn = sample(legs, Math.min(SLOTS, legs.length), random)
    // Keep a destination that is already in the URL on the wheel, so the pointer
    // can rest on it after a reload or a shared link.
    if (pick && !drawn.some((leg) => leg.id === pick)) {
      const chosen = legs.find((leg) => leg.id === pick)
      if (chosen) drawn.splice(0, 1, chosen)
    }
    return drawn
    // `pick` is read but deliberately left out of the deps: it only seeds the
    // very first draw, and a reshuffle should be free to drop it.
  }, [legs, seed, reshuffles])

  const [rotation, setRotation] = useState(() => {
    const index = slots.findIndex((leg) => leg.id === pick)
    return index < 0 ? 0 : restingAngle(index, slots.length, 0)
  })

  useEffect(() => () => clearTimeout(timer.current), [])

  // A destination chosen from the list rather than the wheel still parks the
  // pointer on it, so the two ways of picking never disagree.
  useEffect(() => {
    if (spinning) return
    const index = slots.findIndex((leg) => leg.id === pick)
    if (index < 0) return
    setRotation((current) => restingAngle(index, slots.length, Math.max(0, Math.ceil(current / 360))))
  }, [pick, slots, spinning])

  function spin() {
    if (spinning || slots.length === 0) return
    const index = Math.floor(Math.random() * slots.length)
    const turns = Math.ceil(rotation / 360) + SPIN_TURNS
    setSpinning(true)
    setRotation(restingAngle(index, slots.length, turns))
    timer.current = setTimeout(() => {
      setSpinning(false)
      onLand(slots[index]!)
    }, SPIN_MS)
  }

  if (slots.length === 0) return null

  // Labels counter-rotate about their own centre so they stay upright as the
  // disc turns, rather than ending up upside down on the lower half.
  const spinTransition = spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12,0.75,0.1,1)` : 'none'

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg viewBox="-100 -108 200 208" className="w-[min(78vw,340px)]" role="img" aria-label="Destination wheel">
          <g
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: '0px 0px',
              transition: spinTransition,
            }}
          >
            <circle r={RADIUS} fill="var(--color-ink-800)" />
            {slots.map((leg, index) => (
              <path
                key={leg.id}
                d={segmentPath(index, slots.length)}
                fill={
                  !spinning && leg.id === pick ? 'var(--color-amber)'
                  : index % 2 === 0 ? '#171f2a'
                  : '#212b38'
                }
                stroke="var(--color-line)"
                strokeWidth={0.6}
              />
            ))}
            {slots.map((leg, index) => {
              const mid = (index + 0.5) * (360 / slots.length)
              const [x, y] = rim(mid, LABEL_RADIUS)
              return (
                <text
                  key={leg.id}
                  x={x.toFixed(2)}
                  y={y.toFixed(2)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-mono"
                  fontSize="10"
                  fill={!spinning && leg.id === pick ? 'var(--color-ink-900)' : 'var(--color-text)'}
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    transform: `rotate(${-rotation}deg)`,
                    transition: spinTransition,
                  }}
                >
                  {leg.id}
                </text>
              )
            })}
            <circle r="12" fill="var(--color-ink-900)" stroke="var(--color-line)" />
          </g>
          {/* Drawn after the disc so it sits on top of the rim, not behind it. */}
          <polygon points="0,-86 -8,-103 8,-103" fill="var(--color-amber)" />
        </svg>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={spin}
          disabled={spinning}
          className="rounded border border-amber bg-amber px-5 py-2 text-sm font-semibold text-ink-900 disabled:opacity-50"
        >
          {spinning ? 'Spinning' : 'Spin'}
        </button>
        <button
          type="button"
          onClick={() => setReshuffles((n) => n + 1)}
          disabled={spinning || legs.length <= slots.length}
          className="text-sm text-sky underline underline-offset-4 disabled:text-muted disabled:no-underline"
        >
          Draw 12 more
        </button>
      </div>
    </div>
  )
}
