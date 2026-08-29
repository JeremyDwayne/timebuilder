import { describe, expect, it } from 'vitest'

import { distanceNm } from '~/lib/geo'
import type { SpinQuery } from '~/lib/search'
import { findAirport, findLeg, findLegs, inRangeIds, matchingLegs } from '~/server/airport-db.server'

const base: SpinQuery = {
  from: 'LAL',
  min: 1,
  max: 4,
  speed: 110,
  rwy: 2000,
  paved: true,
  iap: false,
}

const query = (patch: Partial<SpinQuery> = {}): SpinQuery => ({ ...base, ...patch })

describe('matchingLegs', () => {
  it('gives nothing for an unknown departure airport', () => {
    expect(matchingLegs(query({ from: 'ZZZZ' }))).toBeUndefined()
  })

  it('keeps every result inside the distance the time band works out to', () => {
    const result = matchingLegs(query())!
    expect(result.band).toEqual({ minNm: 110, maxNm: 440 })
    expect(result.legs.length).toBeGreaterThan(0)
    for (const leg of result.legs) {
      // The stored distance is rounded, so allow the half mile that costs.
      expect(leg.distanceNm).toBeGreaterThanOrEqual(result.band.minNm - 1)
      expect(leg.distanceNm).toBeLessThanOrEqual(result.band.maxNm + 1)
      expect(leg.distanceNm).toBeCloseTo(distanceNm(result.origin, leg), 0)
    }
  })

  it('sorts by distance and never returns the origin or a military field', () => {
    const { origin, legs } = matchingLegs(query())!
    expect(legs.some((leg) => leg.id === origin.id)).toBe(false)
    expect(legs.some((leg) => leg.mil)).toBe(false)
    const distances = legs.map((leg) => leg.distanceNm)
    expect([...distances].sort((a, b) => a - b)).toEqual(distances)
  })

  it('reads a reversed time band the same way round', () => {
    const forward = matchingLegs(query({ min: 1, max: 3 }))!
    const reversed = matchingLegs(query({ min: 3, max: 1 }))!
    expect(reversed.legs.map((leg) => leg.id)).toEqual(forward.legs.map((leg) => leg.id))
  })

  it('applies each destination filter', () => {
    expect(matchingLegs(query({ iap: true }))!.legs.every((leg) => leg.iap)).toBe(true)
    expect(matchingLegs(query({ paved: true }))!.legs.every((leg) => leg.paved)).toBe(true)
    expect(matchingLegs(query({ rwy: 5000 }))!.legs.every((leg) => (leg.rwy ?? 0) >= 5000)).toBe(true)
    // A tighter filter can only ever remove candidates.
    expect(matchingLegs(query({ rwy: 5000 }))!.legs.length).toBeLessThan(
      matchingLegs(query({ rwy: 2000 }))!.legs.length,
    )
  })

  it('lets a pattern-length hop qualify when the floor is zero', () => {
    const close = matchingLegs(query({ min: 0, max: 0.25 }))!
    expect(close.band.minNm).toBe(0)
    expect(close.legs.length).toBeGreaterThan(0)
  })
})

/**
 * The wheel sees a capped sample and the map sees a set of identifiers. Both are
 * derived from the same predicate, so an airport can never be in range on one
 * view and out of it on the other.
 */
describe('capped views agree with the full match set', () => {
  const wide = query({ min: 0, max: 8, rwy: 0, paved: false })

  it('caps the candidate list without changing what counts as in range', () => {
    const all = matchingLegs(wide)!
    const capped = findLegs(wide)!
    expect(all.legs.length).toBeGreaterThan(400)
    expect(capped.legs).toHaveLength(400)
    expect(capped.truncated).toBe(true)
    expect(capped.matched).toBe(all.legs.length)
    expect(inRangeIds(wide)).toHaveLength(all.legs.length)
  })

  it('spreads the sample across the whole band rather than taking the nearest', () => {
    const all = matchingLegs(wide)!
    const capped = findLegs(wide)!
    expect(capped.legs.at(0)!.distanceNm).toBe(all.legs.at(0)!.distanceNm)
    // The far end of the band has to survive the thinning.
    expect(capped.legs.at(-1)!.distanceNm).toBeGreaterThan(all.legs.at(-1)!.distanceNm * 0.9)
  })

  it('reports no truncation when everything fits', () => {
    const narrow = findLegs(query({ min: 1, max: 1.25 }))!
    expect(narrow.truncated).toBe(false)
    expect(narrow.legs).toHaveLength(narrow.matched)
  })

  it('resolves a pick that the cap dropped from the candidate list', () => {
    const all = matchingLegs(wide)!
    const capped = findLegs(wide)!
    const dropped = all.legs.find((leg) => !capped.legs.some((kept) => kept.id === leg.id))!
    expect(dropped).toBeDefined()
    expect(findLeg(wide, dropped.id)).toMatchObject({ id: dropped.id })
    expect(findLeg(wide, dropped.id.toLowerCase())).toMatchObject({ id: dropped.id })
  })

  it('refuses a pick that is outside the band', () => {
    const origin = findAirport('LAL')!
    expect(findLeg(query({ min: 1, max: 4 }), origin.id)).toBeNull()
    expect(findLeg(query(), 'ZZZZ')).toBeNull()
  })
})
