import { type } from 'arktype'

/**
 * Search-param schema for the spin. Every knob lives in the URL so a spin is
 * shareable and the loader is a pure function of the address bar.
 *
 * Out-of-range numbers are clamped rather than rejected, since these arrive from
 * hand-edited URLs as often as from the form.
 */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// No lower bound: a circuit of the pattern next door is a legitimate answer.
const hours = type('number | string.numeric.parse').pipe((n) => clamp(n, 0, 12))
const knots = type('number | string.numeric.parse').pipe((n) => clamp(n, 40, 400))
const feet = type('number | string.numeric.parse').pipe((n) => clamp(Math.round(n), 0, 15000))
const ident = type('string').pipe((s) => s.trim().toUpperCase().slice(0, 4))

export const spinSearch = type({
  /** Departure airport identifier. Empty until the pilot picks one. */
  from: ident.default(''),
  /** One-way leg time bounds, in hours. */
  min: hours.default(1),
  max: hours.default(4),
  /** Planned true airspeed, used to turn distance into time. */
  speed: knots.default(110),
  /** Shortest acceptable runway. */
  rwy: feet.default(2000),
  /** Hard-surface runways only. */
  paved: type('boolean').default(true),
  /** Only fields with a published instrument approach. */
  iap: type('boolean').default(false),
  /** The airport the wheel landed on. Present only after a spin. */
  'pick?': ident,
})

export type SpinSearch = typeof spinSearch.infer

/** The subset the candidate search depends on; `pick` is resolved on its own. */
export type SpinQuery = Omit<SpinSearch, 'pick'>

export const spinQuery = spinSearch.omit('pick')

/** Normalizes a reversed range so min is always the lower bound. */
export function orderedRange({ min, max }: Pick<SpinQuery, 'min' | 'max'>) {
  return min <= max ? { min, max } : { min: max, max: min }
}
