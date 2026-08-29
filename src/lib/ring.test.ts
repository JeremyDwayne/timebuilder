import { describe, expect, it } from 'vitest'

import { distanceNm } from '~/lib/geo'
import { arc, circle, distanceToSegment, ringContains, ringWithinRange } from '~/lib/ring'

const CENTRE = { lat: 38, lon: -97 }

/** Every [lon, lat] pair in a flat ring. */
function points(ring: Array<number>) {
  return Array.from({ length: ring.length / 2 }, (_, i) => ({
    lon: ring[i * 2]!,
    lat: ring[i * 2 + 1]!,
  }))
}

describe('circle', () => {
  it('puts every point on the declared radius', () => {
    const ring = circle(CENTRE.lat, CENTRE.lon, 25)
    for (const point of points(ring)) {
      expect(distanceNm(CENTRE, point)).toBeCloseTo(25, 0)
    }
  })

  it('closes on itself', () => {
    const ring = points(circle(CENTRE.lat, CENTRE.lon, 10))
    expect(ring.at(0)).toEqual(ring.at(-1))
  })
})

describe('arc', () => {
  const radiusNm = 20
  // Due east and due north of the centre, both exactly on the radius.
  const rim = points(circle(CENTRE.lat, CENTRE.lon, radiusNm))
  const from = rim[0]!
  const to = rim[12]!

  it('holds the radius of its endpoints all the way round', () => {
    for (const point of points(arc(CENTRE, from, to, false))) {
      expect(distanceNm(CENTRE, point)).toBeCloseTo(radiusNm, 0)
    }
  })

  it('sweeps the short way anticlockwise and the long way clockwise', () => {
    const short = points(arc(CENTRE, from, to, false))
    const long = points(arc(CENTRE, from, to, true))
    expect(long.length).toBeGreaterThan(short.length * 2)
    // Anticlockwise from due east to due north stays in the northeast quadrant.
    for (const p of short) {
      expect(p.lat).toBeGreaterThanOrEqual(CENTRE.lat - 1e-9)
      expect(p.lon).toBeGreaterThanOrEqual(CENTRE.lon - 1e-9)
    }
    // The long way round has to pass west of the centre.
    expect(long.some((p) => p.lon < CENTRE.lon)).toBe(true)
  })
})

describe('distanceToSegment', () => {
  it('measures to the nearest point on the segment, not to its ends', () => {
    // A segment one degree of latitude long, with the point half a degree east
    // of its midpoint.
    const lat = 0
    const point = { lat: 0, lon: 0.5 }
    expect(distanceToSegment(point, 0, lat - 0.5, 0, lat + 0.5)).toBeCloseTo(30, 0)
  })

  it('clamps to an endpoint when the point is off the end', () => {
    const point = { lat: 2, lon: 0 }
    expect(distanceToSegment(point, 0, -1, 0, 1)).toBeCloseTo(60, 0)
  })

  it('handles a degenerate zero-length segment', () => {
    expect(distanceToSegment({ lat: 0, lon: 0 }, 0, 1, 0, 1)).toBeCloseTo(60, 0)
  })
})

describe('ringContains', () => {
  const square = [-1, -1, 1, -1, 1, 1, -1, 1]

  it('separates inside from outside', () => {
    expect(ringContains(square, { lat: 0, lon: 0 })).toBe(true)
    expect(ringContains(square, { lat: 0, lon: 2 })).toBe(false)
    expect(ringContains(square, { lat: 2, lon: 0 })).toBe(false)
  })
})

describe('ringWithinRange', () => {
  it('catches a ring that encloses the centre with every vertex far outside it', () => {
    // A ten-degree box around the centre: no vertex is within 30 nm, but the
    // centre is inside the restriction.
    const big = [-102, 33, -92, 33, -92, 43, -102, 43]
    expect(ringWithinRange(big, CENTRE, 30)).toBe(true)
  })

  it('catches a long edge that crosses the plot with both endpoints outside it', () => {
    // A sliver running east to west a tenth of a degree north of the centre.
    const sliver = [-102, 38.1, -92, 38.1, -92, 38.2, -102, 38.2]
    expect(ringContains(sliver, CENTRE)).toBe(false)
    expect(ringWithinRange(sliver, CENTRE, 30)).toBe(true)
  })

  it('rejects a ring that is genuinely out of range', () => {
    const far = points(circle(45, -80, 5))
    const ring = far.flatMap((p) => [p.lon, p.lat])
    expect(ringWithinRange(ring, CENTRE, 100)).toBe(false)
  })

  it('ignores a ring with too few points to bound anything', () => {
    expect(ringWithinRange([CENTRE.lon, CENTRE.lat], CENTRE, 100)).toBe(false)
  })
})
