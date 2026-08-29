import '@tanstack/react-start/server-only'

import { flightRules, type FlightRules, type Metar } from '~/lib/airport'
import { createTtlCache } from './cache.server'

/**
 * Live METAR lookups against the NOAA Aviation Weather Center. This is the slow,
 * network-bound half of the destination page, which is why its route defers it
 * and streams the result in after the rest of the document.
 *
 * It is also the only outbound call the app makes, so it is cached. Stations
 * issue a routine report once an hour, with the odd SPECI in between, and the
 * cache collapses concurrent lookups for the same station into one request.
 */

const ENDPOINT = 'https://aviationweather.gov/api/data/metar'
const TIMEOUT_MS = 6_000
/** Well under the hourly issue cycle, so a SPECI still shows up promptly. */
const CACHE_TTL_MS = 5 * 60_000
/** Missing reports and upstream failures retry sooner. */
const EMPTY_TTL_MS = 90_000

const cache = createTtlCache<Metar | null>({
  ttlMs: CACHE_TTL_MS,
  emptyTtlMs: EMPTY_TTL_MS,
  maxEntries: 500,
})

type AwcMetar = {
  icaoId?: string
  rawOb?: string
  reportTime?: string
  fltCat?: string
  wdir?: number | string | null
  wspd?: number | null
  visib?: number | string | null
  temp?: number | null
  altim?: number | null
}

function asFlightRules(value: unknown): FlightRules | null {
  return flightRules.find((rule) => rule === value) ?? null
}

/** Millibars as reported by the AWC, converted to the inHg pilots actually set. */
function toInHg(millibars: number | null | undefined): number | null {
  if (millibars == null) return null
  return Math.round((millibars / 33.8639) * 100) / 100
}

/**
 * Current observation for a station, or null when the field has no reporting
 * station, the report is unparseable, or the upstream service is slow or down.
 * Served from the cache when a recent lookup exists.
 */
export function fetchMetar(stationId: string): Promise<Metar | null> {
  return cache.get(stationId, () => requestMetar(stationId))
}

async function requestMetar(stationId: string): Promise<Metar | null> {
  try {
    const url = `${ENDPOINT}?ids=${encodeURIComponent(stationId)}&format=json`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'TimeBuilder/1.0 (general aviation trip planner)' },
    })
    if (!response.ok) return null

    const [report] = (await response.json()) as Array<AwcMetar>
    if (!report?.rawOb) return null

    return {
      raw: report.rawOb,
      observedAt: report.reportTime ?? '',
      rules: asFlightRules(report.fltCat),
      windDir: report.wdir === 'VRB' ? 'VRB' : typeof report.wdir === 'number' ? report.wdir : null,
      windKt: report.wspd ?? null,
      visibility: report.visib == null ? null : String(report.visib),
      tempC: report.temp ?? null,
      altimeterInHg: toInHg(report.altim),
    }
  } catch {
    return null
  }
}
