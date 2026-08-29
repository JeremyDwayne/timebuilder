import { describe, expect, it } from 'vitest'

import { labelBudget } from '~/lib/map-labels'

const DESKTOP = [900, 560] as const
const PHONE = [358, 520] as const

describe('labelBudget', () => {
  it('prints a readable handful on a desktop plot at rest, not the whole band', () => {
    const { airports } = labelBudget(...DESKTOP, 1)
    expect(airports).toBeGreaterThanOrEqual(20)
    expect(airports).toBeLessThanOrEqual(40)
  })

  it('buys more labels with every doubling of the zoom', () => {
    const at = (zoom: number) => labelBudget(...DESKTOP, zoom).airports
    expect(at(2)).toBeGreaterThan(at(1))
    expect(at(4)).toBeGreaterThan(at(2))
    expect(at(8)).toBeGreaterThan(at(4))
    // Logarithmic, so the far end does not run away into another wall of text.
    expect(at(8)).toBeLessThan(at(1) * 3)
  })

  it('spends less on a phone than on a desktop at the same zoom', () => {
    expect(labelBudget(...PHONE, 1).airports).toBeLessThan(labelBudget(...DESKTOP, 1).airports)
  })

  it('still names something on the smallest canvas at the widest zoom', () => {
    for (const [w, h] of [PHONE, [280, 300], [1, 1]] as const) {
      const { airports, airspace } = labelBudget(w, h, 0.6)
      expect(airports).toBeGreaterThanOrEqual(6)
      expect(airspace).toBeGreaterThanOrEqual(3)
    }
  })

  it('gives airspace a smaller share than the airports', () => {
    const { airports, airspace } = labelBudget(...DESKTOP, 4)
    expect(airspace).toBeLessThan(airports)
  })

  it('never returns a fraction of a label', () => {
    for (const zoom of [0.6, 1, 1.5, 2.25, 3.7, 8]) {
      const budget = labelBudget(...DESKTOP, zoom)
      expect(Number.isInteger(budget.airports)).toBe(true)
      expect(Number.isInteger(budget.airspace)).toBe(true)
    }
  })

  it('holds up against a nonsense canvas or zoom rather than returning NaN', () => {
    // Every combination, not one degenerate input at a time: a zero area and a
    // zero zoom are each harmless alone and multiply to NaN together.
    for (const width of [0, -100, NaN, 900]) {
      for (const height of [0, NaN, 560]) {
        for (const zoom of [0, -2, NaN, 1]) {
          const budget = labelBudget(width, height, zoom)
          expect(Number.isInteger(budget.airports)).toBe(true)
          expect(budget.airports).toBeGreaterThanOrEqual(6)
          expect(Number.isInteger(budget.airspace)).toBe(true)
          expect(budget.airspace).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })
})
