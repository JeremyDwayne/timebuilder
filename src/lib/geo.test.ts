import { describe, expect, it } from 'vitest'

import { bearingDeg, boundingBox, compassPoint, distanceNm } from '~/lib/geo'

const LAX = { lat: 33.9425, lon: -118.408 }
const JFK = { lat: 40.6398, lon: -73.7789 }
const SFO = { lat: 37.6188, lon: -122.375 }

describe('distanceNm', () => {
  it('matches the published great-circle distance between LAX and JFK', () => {
    // 2144 nm is the standard figure for this pair; a degree of tolerance covers
    // the choice of earth radius.
    expect(distanceNm(LAX, JFK)).toBeCloseTo(2144, -1)
  })

  it('is zero for a point against itself and symmetric otherwise', () => {
    expect(distanceNm(LAX, LAX)).toBe(0)
    expect(distanceNm(LAX, SFO)).toBeCloseTo(distanceNm(SFO, LAX), 9)
  })

  it('converts a degree of latitude to sixty nautical miles', () => {
    expect(distanceNm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(60, 0)
  })
})

describe('bearingDeg', () => {
  it('reads due north, east, south and west', () => {
    const origin = { lat: 40, lon: -100 }
    expect(bearingDeg(origin, { lat: 41, lon: -100 })).toBeCloseTo(0, 5)
    expect(bearingDeg(origin, { lat: 39, lon: -100 })).toBeCloseTo(180, 5)
    // East and west of a mid-latitude point are only approximate, since a
    // great circle curves poleward.
    expect(bearingDeg(origin, { lat: 40, lon: -99 })).toBeCloseTo(90, 0)
    expect(bearingDeg(origin, { lat: 40, lon: -101 })).toBeCloseTo(270, 0)
  })

  it('stays inside 0 to 360', () => {
    const deg = bearingDeg(JFK, LAX)
    expect(deg).toBeGreaterThanOrEqual(0)
    expect(deg).toBeLessThan(360)
  })
})

describe('compassPoint', () => {
  it('labels the cardinals and wraps at north', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(90)).toBe('E')
    expect(compassPoint(180)).toBe('S')
    expect(compassPoint(270)).toBe('W')
    expect(compassPoint(359)).toBe('N')
  })

  it('rounds to the nearest of sixteen points', () => {
    expect(compassPoint(22)).toBe('NNE')
    expect(compassPoint(34)).toBe('NE')
  })
})

describe('boundingBox', () => {
  it('contains every point inside the radius', () => {
    const radiusNm = 100
    const box = boundingBox(LAX, radiusNm)
    // Sixteen points on the rim; none of them may fall outside the box, or the
    // box would reject a candidate that is genuinely in range.
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      const point = {
        lat: LAX.lat + (Math.cos(angle) * radiusNm) / 60,
        lon: LAX.lon + (Math.sin(angle) * radiusNm) / (60 * Math.cos((LAX.lat * Math.PI) / 180)),
      }
      expect(distanceNm(LAX, point)).toBeLessThanOrEqual(radiusNm + 1)
      expect(point.lat).toBeGreaterThanOrEqual(box.minLat)
      expect(point.lat).toBeLessThanOrEqual(box.maxLat)
      expect(point.lon).toBeGreaterThanOrEqual(box.minLon)
      expect(point.lon).toBeLessThanOrEqual(box.maxLon)
    }
  })

  it('does not blow up at the pole', () => {
    const box = boundingBox({ lat: 90, lon: 0 }, 100)
    expect(Number.isFinite(box.minLon)).toBe(true)
    expect(Number.isFinite(box.maxLon)).toBe(true)
  })
})
