import { describe, expect, it } from 'vitest'

import { airspaceKinds } from '~/lib/airspace'
import { distanceNm } from '~/lib/geo'
import { ringWithinRange } from '~/lib/ring'
import { findAirport } from '~/server/airport-db.server'
import { airspaceNear } from '~/server/airspace.server'

const SFO = findAirport('SFO')!
const LAL = findAirport('LAL')!

describe('airspaceNear', () => {
  it('finds the Class B a major airport sits under', () => {
    const areas = airspaceNear(SFO, 30)
    const classB = areas.filter((area) => area.kind === 'B')
    expect(classB.length).toBeGreaterThan(0)
    expect(classB.some((area) => area.label.toUpperCase().includes('SAN FRANCISCO'))).toBe(true)
  })

  it('decodes points as pairs that land near the airport they surround', () => {
    for (const area of airspaceNear(SFO, 30)) {
      expect(area.points.length % 2).toBe(0)
      expect(area.points.length).toBeGreaterThanOrEqual(6)
      for (let i = 0; i < area.points.length; i += 2) {
        // Generous, since the box test admits areas whose far side is distant.
        expect(distanceNm(SFO, { lon: area.points[i]!, lat: area.points[i + 1]! })).toBeLessThan(400)
      }
    }
  })

  it('returns only kinds the legend knows how to draw', () => {
    for (const area of airspaceNear(SFO, 200)) {
      expect(airspaceKinds).toContain(area.kind)
      expect(area.label).not.toBe('')
    }
  })

  it('keeps a null floor for a surface area rather than inventing a zero', () => {
    const surface = airspaceNear(SFO, 60).filter((area) => area.floorFt === null)
    expect(surface.length).toBeGreaterThan(0)
    for (const area of surface) expect(area.floorFt).toBeNull()
  })

  it('grows monotonically with the radius', () => {
    const near = airspaceNear(LAL, 25).length
    const far = airspaceNear(LAL, 250).length
    expect(far).toBeGreaterThan(near)
  })

  it('admits every area that genuinely reaches the radius', () => {
    // The filter is a cheap bounding-box test, so it may over-admit. It must
    // never under-admit: an area the map would draw cannot be missing.
    const radiusNm = 40
    const admitted = new Set(airspaceNear(SFO, radiusNm).map((a) => `${a.kind}|${a.label}`))
    for (const area of airspaceNear(SFO, 400)) {
      if (ringWithinRange(area.points, SFO, radiusNm)) {
        expect(admitted.has(`${area.kind}|${area.label}`)).toBe(true)
      }
    }
  })

  it('finds nothing in the middle of the Pacific', () => {
    expect(airspaceNear({ lat: 5, lon: -150 }, 50)).toEqual([])
  })
})
