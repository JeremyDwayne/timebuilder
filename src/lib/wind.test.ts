import { describe, expect, it } from 'vitest'

import type { Runway } from '~/lib/airport'
import { bearingDelta, favouredRunway, solveRunways } from '~/lib/wind'

/** A single runway laid out on a true heading, with its reciprocal. */
function runway(headingTrue: number, designator = '09/27'): Runway {
  const [le, he] = designator.split('/') as [string, string]
  return {
    designator,
    ends: [
      { ident: le, headingTrue },
      { ident: he, headingTrue: (headingTrue + 180) % 360 },
    ],
    lengthFt: 5000,
    widthFt: 100,
    lit: true,
    paved: true,
    approximateHeading: false,
  }
}

describe('bearingDelta', () => {
  it('takes the short way round', () => {
    expect(bearingDelta(350, 10)).toBe(20)
    expect(bearingDelta(10, 350)).toBe(-20)
    expect(bearingDelta(90, 90)).toBe(0)
    // Exactly opposite lands on the low end of the half-open range.
    expect(bearingDelta(0, 180)).toBe(-180)
  })
})

describe('solveRunways', () => {
  const runways = [runway(90)]

  it('gives a pure headwind when the wind is down the runway', () => {
    const [best] = solveRunways(runways, 90, 12)
    expect(best?.end.ident).toBe('09')
    expect(best?.headwindKt).toBe(12)
    expect(best?.crosswindKt).toBe(0)
    expect(best?.angleOffDeg).toBe(0)
  })

  it('gives a pure crosswind at ninety degrees off', () => {
    const [best] = solveRunways(runways, 180, 10)
    expect(best?.headwindKt).toBe(0)
    expect(best?.crosswindKt).toBe(10)
    expect(best?.angleOffDeg).toBe(90)
  })

  it('names the side the crosswind comes from', () => {
    // Landing on 09, wind from 180 is off the right wing; from 360, the left.
    expect(solveRunways(runways, 180, 10)[0]?.crosswindFrom).toBe('right')
    expect(solveRunways(runways, 360, 10)[0]?.crosswindFrom).toBe('left')
  })

  it('splits the wind evenly at forty-five degrees off', () => {
    const [best] = solveRunways(runways, 135, 20)
    expect(best?.headwindKt).toBeCloseTo(14.1, 1)
    expect(best?.crosswindKt).toBeCloseTo(14.1, 1)
  })

  it('ranks every end by headwind, best first', () => {
    const solutions = solveRunways([runway(90), runway(0, '36/18')], 45, 10)
    expect(solutions).toHaveLength(4)
    const headwinds = solutions.map((s) => s.headwindKt)
    expect([...headwinds].sort((a, b) => b - a)).toEqual(headwinds)
    // A tailwind is a negative headwind, not a discarded option.
    expect(headwinds.at(-1)).toBeLessThan(0)
  })
})

describe('favouredRunway', () => {
  const runways = [runway(90)]

  it('picks the end with the most headwind', () => {
    expect(favouredRunway(runways, { windDir: 260, windKt: 8 })?.end.ident).toBe('27')
  })

  it('declines to choose without a usable wind', () => {
    expect(favouredRunway(runways, null)).toBeNull()
    expect(favouredRunway(runways, { windDir: 'VRB', windKt: 6 })).toBeNull()
    expect(favouredRunway(runways, { windDir: 90, windKt: 0 })).toBeNull()
    expect(favouredRunway(runways, { windDir: 90, windKt: null })).toBeNull()
  })

  it('returns nothing when the field has no usable runway data', () => {
    expect(favouredRunway([], { windDir: 90, windKt: 10 })).toBeNull()
  })
})
