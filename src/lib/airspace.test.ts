import { describe, expect, it } from 'vitest'

import { airspaceKinds, airspaceStyles, altitudeLabel, altitudeSentence, legendOrder } from '~/lib/airspace'
import type { AirspaceArea } from '~/lib/airspace'

const area = (floorFt: number | null, ceilingFt: number | null): AirspaceArea => ({
  kind: 'D',
  label: 'D',
  floorFt,
  ceilingFt,
  points: [],
})

describe('altitudeLabel', () => {
  it('prints ceiling over floor in hundreds of feet', () => {
    expect(altitudeLabel(area(5000, 10000))).toBe('100/50')
  })

  it('marks a surface floor', () => {
    expect(altitudeLabel(area(null, 4000))).toBe('40/SFC')
  })

  it('rounds to the nearest hundred, the way a chart prints it', () => {
    expect(altitudeLabel(area(1200, 4500))).toBe('45/12')
  })

  it('gives no label at all without a ceiling to hang it on', () => {
    expect(altitudeLabel(area(1200, null))).toBeNull()
  })
})

describe('altitudeSentence', () => {
  it('writes both bounds out with separators', () => {
    expect(altitudeSentence({ floorFt: 1200, ceilingFt: 10000 })).toBe(
      '1,200 ft to 10,000 ft MSL',
    )
  })

  it('names the surface and an unpublished ceiling', () => {
    expect(altitudeSentence({ floorFt: null, ceilingFt: 4000 })).toBe('Surface to 4,000 ft MSL')
    expect(altitudeSentence({ floorFt: 5000, ceilingFt: null })).toBe(
      '5,000 ft upward, ceiling not published',
    )
  })
})

describe('chart styling', () => {
  it('styles and lists every kind exactly once', () => {
    expect(Object.keys(airspaceStyles).sort()).toEqual([...airspaceKinds].sort())
    expect([...legendOrder].sort()).toEqual([...airspaceKinds].sort())
  })

  it('never leans on hue alone to separate two kinds', () => {
    // Colour vision deficiency makes the chart blue and magenta hard to tell
    // apart, so no two kinds may share both a stroke and a dash pattern.
    const seen = new Set<string>()
    for (const kind of airspaceKinds) {
      const style = airspaceStyles[kind]
      const signature = `${style.stroke}|${style.dash.join(',')}|${style.width}`
      expect(seen.has(signature)).toBe(false)
      seen.add(signature)
    }
  })
})
