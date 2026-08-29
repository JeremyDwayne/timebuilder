import { describe, expect, it } from 'vitest'

import { hashSeed, sample, seededRandom } from '~/lib/sample'

describe('seededRandom', () => {
  it('gives the same stream to the server and the client for the same seed', () => {
    const draw = (seed: number) => Array.from({ length: 8 }, seededRandom(seed))
    expect(draw(12345)).toEqual(draw(12345))
    expect(draw(12345)).not.toEqual(draw(12346))
  })

  it('stays inside the unit interval', () => {
    const random = seededRandom(1)
    for (let i = 0; i < 2000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('accepts a zero seed without collapsing to a constant', () => {
    const random = seededRandom(0)
    const drawn = new Set(Array.from({ length: 20 }, random))
    expect(drawn.size).toBe(20)
  })
})

describe('hashSeed', () => {
  it('is stable and sensitive to the whole input', () => {
    expect(hashSeed('SQL:1:4:110')).toBe(hashSeed('SQL:1:4:110'))
    expect(hashSeed('SQL:1:4:110')).not.toBe(hashSeed('SQL:1:4:111'))
    expect(hashSeed('SQL:1:4:110')).not.toBe(hashSeed('LAL:1:4:110'))
  })

  it('returns an unsigned integer', () => {
    for (const input of ['', 'a', 'a much longer seed string with spaces']) {
      const seed = hashSeed(input)
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('sample', () => {
  const items = Array.from({ length: 50 }, (_, i) => i)

  it('draws without replacement', () => {
    const drawn = sample(items, 12, seededRandom(7))
    expect(drawn).toHaveLength(12)
    expect(new Set(drawn).size).toBe(12)
    expect(items).toEqual(Array.from({ length: 50 }, (_, i) => i))
  })

  it('stops at the pool size rather than repeating', () => {
    expect(sample([1, 2, 3], 10, seededRandom(1))).toHaveLength(3)
    expect(sample([], 5, seededRandom(1))).toEqual([])
  })

  it('reaches beyond the front of the list', () => {
    // A wheel that only ever drew the nearest twelve would make the far end of
    // the time band unreachable.
    expect(sample(items, 12, seededRandom(3)).some((n) => n > 25)).toBe(true)
  })

  it('repeats exactly for the same seed', () => {
    expect(sample(items, 12, seededRandom(99))).toEqual(sample(items, 12, seededRandom(99)))
  })
})
