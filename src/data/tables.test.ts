import { describe, expect, it } from 'vitest'

import { AIRPORTS_TABLE } from '~/data/airports.generated'
import { AIRSPACE_TABLE } from '~/data/airspace.generated'
import { FREQUENCIES_TABLE } from '~/data/frequencies.generated'
import { RUNWAYS_TABLE } from '~/data/runways.generated'
import { STATE_LABELS_TABLE } from '~/data/state-labels.generated'
import { airportFrequencies, airportRunways, findAirport } from '~/server/airport-db.server'

/**
 * The generated tables are pipe-delimited with one row per line and the decoders
 * are plain `split`, so a stray delimiter in a name or a label would shift every
 * field after it and go unnoticed. These check the encoding holds after a data
 * refresh, and that the decoders read a known field back correctly.
 */

const TABLES = [
  { name: 'airports', table: AIRPORTS_TABLE, fields: 10 },
  { name: 'runways', table: RUNWAYS_TABLE, fields: 7 },
  { name: 'frequencies', table: FREQUENCIES_TABLE, fields: 4 },
  { name: 'airspace', table: AIRSPACE_TABLE, fields: 6 },
  { name: 'state-labels', table: STATE_LABELS_TABLE, fields: 3 },
] as const

describe.each(TABLES)('$name table', ({ table, fields }) => {
  const rows = table.split('\n')

  it('has rows', () => {
    expect(rows.length).toBeGreaterThan(50)
  })

  it('gives every row exactly the declared field count', () => {
    const wrong = rows.filter((row) => row.split('|').length !== fields)
    expect(wrong.slice(0, 3)).toEqual([])
  })

  it('keys every row on a non-empty first field', () => {
    expect(rows.filter((row) => row.split('|')[0] === '')).toEqual([])
  })
})

describe('airport decoding', () => {
  it('reads a known field back with its flags and coordinates intact', () => {
    const lakeland = findAirport('LAL')
    expect(lakeland).toMatchObject({
      id: 'LAL',
      icao: 'KLAL',
      state: 'FL',
      iap: true,
      mil: false,
      paved: true,
    })
    expect(lakeland?.lat).toBeCloseTo(27.99, 1)
    expect(lakeland?.lon).toBeCloseTo(-82.02, 1)
  })

  it('finds the same airport by ICAO code', () => {
    expect(findAirport('KLAL')).toBe(findAirport('lal'))
  })

  it('reconstructs the implied K prefix rather than storing it', () => {
    expect(AIRPORTS_TABLE.split('\n').some((row) => row.split('|')[1] === 'KLAL')).toBe(false)
  })

  it('returns nothing for an identifier that is not in the table', () => {
    expect(findAirport('ZZZZ')).toBeUndefined()
  })
})

describe('runway and frequency decoding', () => {
  it('orders runways longest first and pairs both ends', () => {
    const runways = airportRunways('LAL')
    expect(runways.length).toBeGreaterThan(0)
    for (const runway of runways) {
      expect(runway.designator).toBe(`${runway.ends[0].ident}/${runway.ends[1].ident}`)
      const [le, he] = runway.ends
      expect((le.headingTrue + 180) % 360).toBeCloseTo(he.headingTrue, 5)
    }
    const lengths = runways.map((r) => r.lengthFt ?? 0)
    expect([...lengths].sort((a, b) => b - a)).toEqual(lengths)
  })

  it('reads frequencies inside the VHF band', () => {
    const frequencies = airportFrequencies('LAL')
    expect(frequencies.length).toBeGreaterThan(0)
    for (const frequency of frequencies) {
      expect(frequency.mhz).toBeGreaterThanOrEqual(108)
      expect(frequency.mhz).toBeLessThanOrEqual(137)
    }
  })
})
