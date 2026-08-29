import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchMetar } from '~/server/weather.server'

/**
 * The AWC response is mapped field by field into the shape the pages read, and
 * the module caches by station, so every test uses an identifier of its own.
 */

let station = 0
const nextStation = () => `KTS${String(++station).padStart(2, '0')}`

function respond(body: unknown, ok = true) {
  const fetchMock = vi.fn(async (url: string) => ({ ok, json: async () => body, url }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchMetar', () => {
  it('maps a full report into the shape the pages read', async () => {
    respond([
      {
        rawOb: 'KSQL 291553Z 29008KT 10SM FEW025 21/12 A2996',
        reportTime: '2026-08-29 15:53:00',
        fltCat: 'VFR',
        wdir: 290,
        wspd: 8,
        visib: 10,
        temp: 21,
        altim: 1014.5,
      },
    ])

    expect(await fetchMetar(nextStation())).toEqual({
      raw: 'KSQL 291553Z 29008KT 10SM FEW025 21/12 A2996',
      observedAt: '2026-08-29 15:53:00',
      rules: 'VFR',
      windDir: 290,
      windKt: 8,
      visibility: '10',
      tempC: 21,
      altimeterInHg: 29.96,
    })
  })

  it('keeps a variable wind as VRB rather than turning it into a heading', async () => {
    respond([{ rawOb: 'X', wdir: 'VRB', wspd: 4 }])
    expect(await fetchMetar(nextStation())).toMatchObject({ windDir: 'VRB', windKt: 4 })
  })

  it('leaves every absent field null instead of guessing', async () => {
    respond([{ rawOb: 'KXYZ 291553Z AUTO' }])
    expect(await fetchMetar(nextStation())).toMatchObject({
      observedAt: '',
      rules: null,
      windDir: null,
      windKt: null,
      visibility: null,
      tempC: null,
      altimeterInHg: null,
    })
  })

  it('rejects a category the app does not know how to style', async () => {
    respond([{ rawOb: 'X', fltCat: 'SEVERE' }])
    expect((await fetchMetar(nextStation()))?.rules).toBeNull()
  })

  it('converts the reported millibars to the inches a pilot sets', async () => {
    respond([{ rawOb: 'X', altim: 1013.25 }])
    expect((await fetchMetar(nextStation()))?.altimeterInHg).toBeCloseTo(29.92, 2)
  })

  it('keeps a visibility the feed reports as text', async () => {
    respond([{ rawOb: 'X', visib: '10+' }])
    expect((await fetchMetar(nextStation()))?.visibility).toBe('10+')
  })

  it('gives null for a station with no report, an error, or an outage', async () => {
    respond([])
    expect(await fetchMetar(nextStation())).toBeNull()

    respond([{ icaoId: 'KXYZ' }])
    expect(await fetchMetar(nextStation())).toBeNull()

    respond([{ rawOb: 'X' }], false)
    expect(await fetchMetar(nextStation())).toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('timeout'))))
    expect(await fetchMetar(nextStation())).toBeNull()
  })

  it('asks the station only once inside the cache window', async () => {
    const id = nextStation()
    const fetchMock = respond([{ rawOb: 'X' }])
    await fetchMetar(id)
    await fetchMetar(id)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends the station identifier the caller asked for', async () => {
    const id = nextStation()
    const fetchMock = respond([{ rawOb: 'X' }])
    await fetchMetar(id)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`ids=${id}`)
  })
})
