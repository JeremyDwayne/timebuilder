// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Leg } from '~/lib/airport'
import { addEntry, listEntries, removeEntry, totalHours } from '~/lib/logbook'

const leg = (id: string, minutes: number, distanceNm = minutes * 2): Leg => ({
  id,
  icao: `K${id}`,
  name: `${id} Field`,
  city: 'Somewhere',
  state: 'CA',
  lat: 37,
  lon: -122,
  elev: 50,
  iap: false,
  mil: false,
  rwy: 4000,
  paved: true,
  lit: true,
  distanceNm,
  courseDeg: 90,
  minutes,
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('addEntry', () => {
  it('keeps the departure field and the solved leg alongside the destination', () => {
    const [entry] = addEntry(leg('LVK', 45), 'SQL', '2026-08-29T17:00:00.000Z')
    expect(entry).toEqual({
      id: 'LVK',
      name: 'LVK Field',
      city: 'Somewhere',
      state: 'CA',
      from: 'SQL',
      distanceNm: 90,
      minutes: 45,
      loggedAt: '2026-08-29T17:00:00.000Z',
    })
  })

  it('survives a reload', () => {
    addEntry(leg('LVK', 45), 'SQL', '2026-08-29T17:00:00.000Z')
    expect(listEntries()).toHaveLength(1)
  })

  it('logs the same destination twice, since a field can be flown to again', () => {
    addEntry(leg('LVK', 45), 'SQL', '2026-08-28T17:00:00.000Z')
    addEntry(leg('LVK', 45), 'SQL', '2026-08-29T17:00:00.000Z')
    expect(listEntries()).toHaveLength(2)
  })

  it('caps the log rather than growing without bound', () => {
    const at = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString()
    for (let i = 0; i < 210; i++) addEntry(leg('LVK', 45), 'SQL', at(i))
    const kept = listEntries()
    expect(kept).toHaveLength(200)
    // The cap drops the oldest, not the newest.
    expect(kept[0]?.loggedAt).toBe(at(209))
    expect(kept.at(-1)?.loggedAt).toBe(at(10))
  })
})

describe('listEntries', () => {
  it('reads newest first regardless of the order they were written', () => {
    addEntry(leg('A', 30), 'SQL', '2026-08-01T10:00:00.000Z')
    addEntry(leg('B', 30), 'SQL', '2026-08-03T10:00:00.000Z')
    addEntry(leg('C', 30), 'SQL', '2026-08-02T10:00:00.000Z')
    expect(listEntries().map((e) => e.id)).toEqual(['B', 'C', 'A'])
  })

  it('reads an empty log when storage holds something that is not a log', () => {
    window.localStorage.setItem('timebuilder.logbook.v1', '{"not":"an array"}')
    expect(listEntries()).toEqual([])
  })
})

describe('removeEntry', () => {
  it('removes the one spin, keyed on when it was logged', () => {
    addEntry(leg('A', 30), 'SQL', '2026-08-01T10:00:00.000Z')
    addEntry(leg('B', 30), 'SQL', '2026-08-02T10:00:00.000Z')
    const left = removeEntry('2026-08-01T10:00:00.000Z')
    expect(left.map((e) => e.id)).toEqual(['B'])
    expect(listEntries().map((e) => e.id)).toEqual(['B'])
  })

  it('leaves the log alone when nothing matches', () => {
    addEntry(leg('A', 30), 'SQL', '2026-08-01T10:00:00.000Z')
    expect(removeEntry('2020-01-01T00:00:00.000Z')).toHaveLength(1)
  })
})

describe('totalHours', () => {
  it('counts the return leg, since the aeroplane has to come home', () => {
    expect(totalHours([{ minutes: 45 } as never])).toBeCloseTo(1.5, 6)
    expect(totalHours([{ minutes: 45 } as never, { minutes: 30 } as never])).toBeCloseTo(2.5, 6)
  })

  it('is zero for an empty log', () => {
    expect(totalHours([])).toBe(0)
  })
})
