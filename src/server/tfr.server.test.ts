import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { distanceNm } from '~/lib/geo'
import { ringContains } from '~/lib/ring'

/**
 * The FAA publishes an index of active restrictions and one XNOTAM document per
 * NOTAM, and the shapes in those documents are the part of this app most likely
 * to be wrong without saying so. The feed is stubbed here so the parser, the
 * state filter and the range narrowing are all exercised without the network.
 *
 * The module caches both endpoints at module scope, so each test loads its own
 * copy rather than inheriting the previous test's feed.
 */

const LAKELAND = { lat: 27.9889, lon: -82.0186 }

async function loadTfrsNear() {
  vi.resetModules()
  return (await import('~/server/tfr.server')).tfrsNear
}

type Entry = { notam_id: string; type?: string; description?: string; state?: string }

type FeedResponse = { ok: boolean; json: () => Promise<unknown>; text: () => Promise<string> }

const respond = (ok: boolean, json: unknown, text: string): FeedResponse => ({
  ok,
  json: async () => json,
  text: async () => text,
})

/** Serves the index and the per-NOTAM documents, and nothing else. */
function serveFeed(entries: Array<Entry>, documents: Record<string, string>) {
  const fetchMock = vi.fn(async (url: string): Promise<FeedResponse> => {
    if (url.includes('exportTfrList')) return respond(true, entries, '')
    const notamId = /detail_(.+)\.xml$/.exec(url)?.[1]?.replace('_', '/') ?? ''
    const document = documents[notamId]
    return document ? respond(true, null, document) : respond(false, null, '')
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** An XNOTAM whose single boundary is a circle. */
const circleDocument = (lat: number, lon: number, radiusNm: number, ceilingFt = 3000) => `
<Not>
  <Ase>
    <valDistVerLower>0</valDistVerLower><uomDistVerLower>FT</uomDistVerLower>
    <valDistVerUpper>${ceilingFt}</valDistVerUpper><uomDistVerUpper>FT</uomDistVerUpper>
    <Abd>
      <Avx>
        <codeType>CIR</codeType>
        <geoLat>${Math.abs(lat).toFixed(8)}${lat < 0 ? 'S' : 'N'}</geoLat>
        <geoLong>${Math.abs(lon).toFixed(8)}${lon < 0 ? 'W' : 'E'}</geoLong>
        <valRadiusArc>${radiusNm}</valRadiusArc>
        <uomRadiusArc>NM</uomRadiusArc>
      </Avx>
    </Abd>
  </Ase>
</Not>`

const vertex = (lat: number, lon: number) => `
      <Avx>
        <codeType>GRC</codeType>
        <geoLat>${Math.abs(lat).toFixed(8)}${lat < 0 ? 'S' : 'N'}</geoLat>
        <geoLong>${Math.abs(lon).toFixed(8)}${lon < 0 ? 'W' : 'E'}</geoLong>
      </Avx>`

/** An XNOTAM whose boundary is a straight-sided polygon. */
const polygonDocument = (corners: Array<[number, number]>, floorFt = 1000, ceilingFt = 8000) => `
<Not>
  <Ase>
    <valDistVerLower>${floorFt}</valDistVerLower><uomDistVerLower>FT</uomDistVerLower>
    <valDistVerUpper>${ceilingFt}</valDistVerUpper><uomDistVerUpper>FT</uomDistVerUpper>
    <Abd>${corners.map(([lat, lon]) => vertex(lat, lon)).join('')}
    </Abd>
  </Ase>
</Not>`

const entry = (notam_id: string, patch: Partial<Entry> = {}): Entry => ({
  notam_id,
  type: 'HAZARDS',
  description: 'Aerial demonstration',
  state: 'FL',
  ...patch,
})

const FLORIDA = new Set(['FL'])

afterEach(() => vi.unstubAllGlobals())
beforeEach(() => vi.resetModules())

describe('tfrsNear', () => {
  it('says so outright when the FAA feed cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('timeout'))))
    const tfrsNear = await loadTfrsNear()
    expect(await tfrsNear(LAKELAND, 100, FLORIDA)).toEqual({
      tfrs: [],
      undrawn: 0,
      unavailable: true,
    })
  })

  it('turns a circle vertex into a ring on the published radius', async () => {
    serveFeed([entry('6/1001')], { '6/1001': circleDocument(28.1, -82.1, 5) })
    const tfrsNear = await loadTfrsNear()
    const { tfrs, undrawn } = await tfrsNear(LAKELAND, 50, FLORIDA)

    expect(undrawn).toBe(0)
    const [part] = tfrs[0]!.parts
    expect(part).toBeDefined()
    for (let i = 0; i < part!.ring.length; i += 2) {
      const point = { lon: part!.ring[i]!, lat: part!.ring[i + 1]! }
      expect(distanceNm({ lat: 28.1, lon: -82.1 }, point)).toBeCloseTo(5, 0)
    }
  })

  it('reads a surface floor as null and keeps the published ceiling', async () => {
    serveFeed([entry('6/1002')], { '6/1002': circleDocument(28.1, -82.1, 5, 3000) })
    const tfrsNear = await loadTfrsNear()
    const { tfrs } = await tfrsNear(LAKELAND, 50, FLORIDA)
    expect(tfrs[0]!.parts[0]).toMatchObject({ floorFt: null, ceilingFt: 3000 })
  })

  it('closes a straight-sided boundary around the ground it covers', async () => {
    const corners: Array<[number, number]> = [
      [28.2, -82.2],
      [28.2, -81.8],
      [27.8, -81.8],
      [27.8, -82.2],
    ]
    serveFeed([entry('6/1003')], { '6/1003': polygonDocument(corners) })
    const tfrsNear = await loadTfrsNear()
    const { tfrs } = await tfrsNear(LAKELAND, 50, FLORIDA)

    const part = tfrs[0]!.parts[0]!
    expect(part.ring).toHaveLength(8)
    expect(part).toMatchObject({ floorFt: 1000, ceilingFt: 8000 })
    expect(ringContains(part.ring, { lat: 28, lon: -82 })).toBe(true)
    expect(ringContains(part.ring, { lat: 30, lon: -82 })).toBe(false)
  })

  it('reads the vertex coordinate rather than a reference point nested inside it', async () => {
    // The feed nests an Frd block that repeats geoLat and geoLong for a radial
    // fix. Reading the first tag in document order would take that instead.
    const document = `
<Not>
  <Ase>
    <valDistVerUpper>4000</valDistVerUpper><uomDistVerUpper>FT</uomDistVerUpper>
    <Abd>
      <Avx>
        <Frd><geoLat>10.00000000N</geoLat><geoLong>10.00000000W</geoLong></Frd>
        <codeType>CIR</codeType>
        <geoLat>28.10000000N</geoLat>
        <geoLong>82.10000000W</geoLong>
        <valRadiusArc>5</valRadiusArc>
        <uomRadiusArc>NM</uomRadiusArc>
      </Avx>
    </Abd>
  </Ase>
</Not>`
    serveFeed([entry('6/1004')], { '6/1004': document })
    const tfrsNear = await loadTfrsNear()
    const { tfrs } = await tfrsNear(LAKELAND, 50, FLORIDA)
    expect(tfrs[0]!.parts[0]!.ring[1]).toBeCloseTo(28.1, 1)
  })

  it('gives each part of a multi-part restriction its own limits', async () => {
    const document = `
<Not>
  <Ase>
    <valDistVerLower>0</valDistVerLower><uomDistVerLower>FT</uomDistVerLower>
    <valDistVerUpper>3000</valDistVerUpper><uomDistVerUpper>FT</uomDistVerUpper>
    <Abd>
      <Avx><codeType>CIR</codeType><geoLat>28.10000000N</geoLat><geoLong>82.10000000W</geoLong>
      <valRadiusArc>5</valRadiusArc><uomRadiusArc>NM</uomRadiusArc></Avx>
    </Abd>
  </Ase>
  <Ase>
    <valDistVerLower>3000</valDistVerLower><uomDistVerLower>FT</uomDistVerLower>
    <valDistVerUpper>9000</valDistVerUpper><uomDistVerUpper>FT</uomDistVerUpper>
    <Abd>
      <Avx><codeType>CIR</codeType><geoLat>28.10000000N</geoLat><geoLong>82.10000000W</geoLong>
      <valRadiusArc>10</valRadiusArc><uomRadiusArc>NM</uomRadiusArc></Avx>
    </Abd>
  </Ase>
</Not>`
    serveFeed([entry('6/1005')], { '6/1005': document })
    const tfrsNear = await loadTfrsNear()
    const { tfrs } = await tfrsNear(LAKELAND, 50, FLORIDA)

    expect(tfrs[0]!.parts).toHaveLength(2)
    expect(tfrs[0]!.parts.map((p) => [p.floorFt, p.ceilingFt])).toEqual([
      [null, 3000],
      [3000, 9000],
    ])
  })

  it('drops a restriction whose shape is nowhere near the plot', async () => {
    serveFeed([entry('6/1006', { state: 'FL' })], {
      '6/1006': circleDocument(45, -100, 5),
    })
    const tfrsNear = await loadTfrsNear()
    expect((await tfrsNear(LAKELAND, 50, FLORIDA)).tfrs).toEqual([])
  })

  it('keeps a restriction it could not draw, and says how many there are', async () => {
    // No document is served, so the shape cannot be read. Dropping it would
    // leave the map quietly missing an active restriction.
    serveFeed([entry('6/1007')], {})
    const tfrsNear = await loadTfrsNear()
    const { tfrs, undrawn, unavailable } = await tfrsNear(LAKELAND, 50, FLORIDA)

    expect(unavailable).toBe(false)
    expect(undrawn).toBe(1)
    expect(tfrs).toHaveLength(1)
    expect(tfrs[0]).toMatchObject({ notamId: '6/1007', parts: [], nationwide: false })
  })

  it('narrows to the states in view but never drops a nationwide notice', async () => {
    serveFeed(
      [
        entry('6/1008', { state: 'FL' }),
        entry('6/1009', { state: 'AK' }),
        entry('6/1010', { state: 'USA', type: 'SECURITY' }),
        entry('6/1011', { state: '' }),
      ],
      {},
    )
    const tfrsNear = await loadTfrsNear()
    const { tfrs } = await tfrsNear(LAKELAND, 50, FLORIDA)

    expect(tfrs.map((t) => t.notamId)).toEqual(['6/1008', '6/1010', '6/1011'])
    expect(tfrs.map((t) => t.nationwide)).toEqual([false, true, true])
  })

  it('ignores an index entry with no NOTAM number to look up', async () => {
    serveFeed([{ notam_id: '' } as Entry, entry('6/1012')], {})
    const tfrsNear = await loadTfrsNear()
    expect((await tfrsNear(LAKELAND, 50, FLORIDA)).tfrs).toHaveLength(1)
  })

  it('asks for each document once and reuses the index across lookups', async () => {
    const fetchMock = serveFeed([entry('6/1013')], { '6/1013': circleDocument(28.1, -82.1, 5) })
    const tfrsNear = await loadTfrsNear()
    await tfrsNear(LAKELAND, 50, FLORIDA)
    await tfrsNear(LAKELAND, 50, FLORIDA)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('carries the index text through to what the pilot reads', async () => {
    serveFeed([entry('6/1014', { type: ' VIP ', description: '  Presidential movement  ' })], {})
    const tfrsNear = await loadTfrsNear()
    expect((await tfrsNear(LAKELAND, 50, FLORIDA)).tfrs[0]).toMatchObject({
      type: 'VIP',
      description: 'Presidential movement',
      state: 'FL',
    })
  })
})
