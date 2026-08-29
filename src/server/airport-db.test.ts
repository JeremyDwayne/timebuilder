import { describe, expect, it } from 'vitest'

import { distanceNm } from '~/lib/geo'
import type { SpinQuery } from '~/lib/search'
import {
  airportRestaurants,
  airportsNear,
  findAirport,
  findLeg,
  findLegs,
  inRangeIds,
  matchingLegs,
} from '~/server/airport-db.server'

const base: SpinQuery = {
  from: 'LAL',
  min: 1,
  max: 4,
  speed: 110,
  rwy: 2000,
  paved: true,
  iap: false,
  food: false,
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
    expect(matchingLegs(query({ food: true }))!.legs.every((leg) => leg.food > 0)).toBe(true)
    expect(matchingLegs(query({ rwy: 5000 }))!.legs.every((leg) => (leg.rwy ?? 0) >= 5000)).toBe(true)
    // A tighter filter can only ever remove candidates.
    expect(matchingLegs(query({ rwy: 5000 }))!.legs.length).toBeLessThan(
      matchingLegs(query({ rwy: 2000 }))!.legs.length,
    )
  })

  /**
   * The count, the filter and the map mark have to be the same rule. If they
   * drifted apart the plot could mark a field the wheel would never draw.
   */
  it('counts food only where the filter would also keep the field', () => {
    const all = matchingLegs(query())!.legs
    const withFood = matchingLegs(query({ food: true }))!.legs
    expect(withFood.map((leg) => leg.id)).toEqual(
      all.filter((leg) => leg.food > 0).map((leg) => leg.id),
    )
    expect(withFood.length).toBeGreaterThan(0)
    expect(withFood.length).toBeLessThan(all.length)
  })

  /**
   * The map payload has to agree with the mark it draws. Miami carries
   * seventy-four entries and none of them are a destination, so a popup that
   * named them would say the opposite of the burger the plot did not draw.
   */
  it('never hands the map food to name at a field it refuses to mark', () => {
    const airline = ['MIA', 'BOS', 'DEN', 'SEA']
    for (const id of airline) {
      const field = airportsNear(findAirport(id)!, 1).find((f) => f.id === id)
      expect(field, id).toBeDefined()
      expect(field!.airlineField, id).toBe(true)
      expect(field!.fieldFood, id).toBe(false)
      expect(field!.food, id).toEqual([])
      // The counts survive, so the popup can still say why it is naming nothing.
      expect(field!.foodCount + field!.terminalFood, id).toBeGreaterThan(0)
    }
  })

  it('sends no more of a field than the popup can show', () => {
    for (const field of airportsNear(findAirport('LAL')!, 400)) {
      expect(field.food.length).toBeLessThanOrEqual(3)
      expect(field.food.length).toBeLessThanOrEqual(field.foodCount)
      if (field.fieldFood) expect(field.food.length).toBeGreaterThan(0)
    }
  })

  it('marks exactly those fields on the map, and no others', () => {
    const legs = matchingLegs(query())!.legs
    const marked = new Map(
      airportsNear(findAirport('LAL')!, 400).map((field) => [field.id, field.fieldFood]),
    )
    for (const leg of legs) {
      if (marked.has(leg.id)) expect(marked.get(leg.id)).toBe(leg.food > 0)
    }
  })

  /**
   * Miami and Fort Lauderdale both carry plenty of mapped food and both sit
   * inside the band from Lakeland, so if the airline-field guard ever came off
   * they would show up as hamburger runs.
   */
  it('never counts food at a field the airlines serve', () => {
    const reachable = matchingLegs(query({ food: true }))!.legs.map((leg) => leg.id)
    for (const id of ['MIA', 'FLL']) {
      const places = airportRestaurants(id)
      expect(places.length).toBeGreaterThan(0)
      expect(places.every((place) => place.airlineField)).toBe(true)
      expect(reachable).not.toContain(id)
    }
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
