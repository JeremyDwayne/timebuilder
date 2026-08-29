import { type } from 'arktype'
import { describe, expect, it } from 'vitest'

import { orderedRange, spinSearch } from '~/lib/search'

/** ArkType returns errors as a value, so a throw here means the schema rejected. */
function parse(input: Record<string, unknown>) {
  const out = spinSearch(input)
  if (out instanceof type.errors) throw new Error(out.summary)
  return out
}

describe('spinSearch', () => {
  it('fills in the defaults for an empty address bar', () => {
    expect(parse({})).toMatchObject({
      from: '',
      min: 1,
      max: 4,
      speed: 110,
      rwy: 2000,
      paved: true,
      iap: false,
      food: false,
    })
  })

  it('parses the numbers that arrive from a URL as strings', () => {
    expect(parse({ min: '0.5', max: '2.25', speed: '135' })).toMatchObject({
      min: 0.5,
      max: 2.25,
      speed: 135,
    })
  })

  it('clamps a hand-edited URL rather than rejecting it', () => {
    expect(parse({ min: -5, max: 99 })).toMatchObject({ min: 0, max: 12 })
    expect(parse({ speed: 5 }).speed).toBe(40)
    expect(parse({ speed: 9000 }).speed).toBe(400)
    expect(parse({ rwy: -1 }).rwy).toBe(0)
    expect(parse({ rwy: 99999 }).rwy).toBe(15000)
  })

  it('normalizes identifiers and caps them at four characters', () => {
    expect(parse({ from: ' klax ' }).from).toBe('KLAX')
    expect(parse({ from: 'toolong' }).from).toBe('TOOL')
  })

  it('leaves pick absent until a spin lands', () => {
    expect(parse({}).pick).toBeUndefined()
    expect(parse({ pick: 'bow' }).pick).toBe('BOW')
  })
})

describe('orderedRange', () => {
  it('leaves an ordered range alone', () => {
    expect(orderedRange({ min: 1, max: 4 })).toEqual({ min: 1, max: 4 })
  })

  it('swaps a reversed one', () => {
    expect(orderedRange({ min: 4, max: 1 })).toEqual({ min: 1, max: 4 })
  })
})
