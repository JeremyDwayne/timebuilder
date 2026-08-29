import { describe, expect, it } from 'vitest'

import { stateOutlines } from '~/server/geography.server'

/**
 * The rings are stored as delta-encoded hundredths of a degree, so a single
 * mis-decoded pair does not fail loudly: it drags every later point with it.
 * These check the decoded geometry still lands on the United States.
 */
describe('stateOutlines', () => {
  const { rings, labels } = stateOutlines()

  it('decodes every ring into closed pairs of coordinates', () => {
    expect(rings.length).toBeGreaterThan(50)
    for (const ring of rings) {
      expect(ring.length % 2).toBe(0)
      expect(ring.length).toBeGreaterThanOrEqual(6)
    }
  })

  it('places every decoded point inside the United States and its territories', () => {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 2) {
        // The Aleutians run past the antimeridian and stay on the western side
        // of it rather than wrapping, so longitude reaches beyond -180.
        expect(ring[i]).toBeGreaterThan(-200)
        expect(ring[i]).toBeLessThan(-60)
        expect(ring[i + 1]).toBeGreaterThan(15)
        expect(ring[i + 1]).toBeLessThan(75)
      }
    }
  })

  it('labels states with two-letter codes on unique positions', () => {
    expect(labels.length).toBeGreaterThan(45)
    for (const label of labels) {
      expect(label.code).toMatch(/^[A-Z]{2}$/)
      expect(Number.isFinite(label.lon)).toBe(true)
      expect(Number.isFinite(label.lat)).toBe(true)
    }
    expect(new Set(labels.map((l) => l.code)).size).toBe(labels.length)
  })

  it('puts a known label inside the state it names', () => {
    // Colorado is a rectangle, which makes it the cheapest label to check.
    const colorado = labels.find((l) => l.code === 'CO')!
    expect(colorado.lat).toBeGreaterThan(37)
    expect(colorado.lat).toBeLessThan(41)
    expect(colorado.lon).toBeGreaterThan(-109)
    expect(colorado.lon).toBeLessThan(-102)
  })

  it('parses once and hands back the same object', () => {
    expect(stateOutlines()).toBe(stateOutlines())
  })
})
