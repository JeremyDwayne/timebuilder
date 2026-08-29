import '@tanstack/react-start/server-only'

import { AIRPORTS_TABLE } from '~/data/airports.generated'
import { RUNWAYS_TABLE } from '~/data/runways.generated'
import { FREQUENCIES_TABLE } from '~/data/frequencies.generated'
import { boundingBox, bearingDeg, distanceNm, type LatLon } from '~/lib/geo'
import { orderedRange, type SpinQuery } from '~/lib/search'
import {
  frequencyTypes,
  type Airport,
  type Frequency,
  type FrequencyType,
  type Leg,
  type MapAirport,
  type Relative,
  type Runway,
} from '~/lib/airport'

/**
 * The airport, runway and frequency tables live here and only here. This module
 * is server-only, so none of it is ever part of a client bundle; routes reach it
 * exclusively through the server functions in `airports.functions.ts`.
 */

const FLAG_IAP = 1
const FLAG_MIL = 2
const FLAG_PAVED = 4
const FLAG_LIT = 8

/**
 * How many candidates the wheel and the candidate list receive. The map does not
 * use this list at all, so the cap only limits what those two show, never what
 * counts as in range.
 */
const MAX_CANDIDATES = 400

function parseTable(): Array<Airport> {
  return AIRPORTS_TABLE.split('\n').map((line) => {
    const [id, icao, name, city, state, lat, lon, elev, flags, rwy] = line.split('|') as [
      string, string, string, string, string, string, string, string, string, string,
    ]
    const bits = Number(flags)
    const hasRunway = rwy !== ''
    return {
      id,
      icao: icao || (/^[A-Z]{3}$/.test(id) ? `K${id}` : null),
      name,
      city,
      state,
      lat: Number(lat),
      lon: Number(lon),
      elev: elev === '' ? null : Number(elev),
      iap: (bits & FLAG_IAP) !== 0,
      mil: (bits & FLAG_MIL) !== 0,
      rwy: hasRunway ? Number(rwy) : null,
      paved: hasRunway ? (bits & FLAG_PAVED) !== 0 : null,
      lit: hasRunway ? (bits & FLAG_LIT) !== 0 : null,
    }
  })
}

let cache: { list: Array<Airport>; byId: Map<string, Airport> } | undefined

function db() {
  if (!cache) {
    const list = parseTable()
    const byId = new Map<string, Airport>()
    for (const airport of list) {
      byId.set(airport.id, airport)
      if (airport.icao) byId.set(airport.icao, airport)
    }
    cache = { list, byId }
  }
  return cache
}

/** Looks an airport up by FAA identifier or ICAO code. */
export function findAirport(identifier: string): Airport | undefined {
  return db().byId.get(identifier.trim().toUpperCase())
}

/** Typeahead over identifier, name and city. Identifier matches rank first. */
export function searchAirports(query: string, limit = 8): Array<Airport> {
  const q = query.trim().toUpperCase()
  if (q.length < 2) return []

  const scored: Array<{ airport: Airport; score: number }> = []
  for (const airport of db().list) {
    const score =
      airport.id === q || airport.icao === q ? 0
      : airport.id.startsWith(q) ? 1
      : airport.name.toUpperCase().startsWith(q) ? 2
      : airport.city.toUpperCase().startsWith(q) ? 3
      : airport.name.toUpperCase().includes(q) || airport.city.toUpperCase().includes(q) ? 4
      : -1
    if (score >= 0) scored.push({ airport, score })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.airport.id.localeCompare(b.airport.id))
    .slice(0, limit)
    .map((s) => s.airport)
}

/**
 * Thins an oversized result down to `limit` entries spread evenly across the
 * distance-sorted list, so the near and far ends of the time band both survive.
 */
function spread<T>(items: Array<T>, limit: number): Array<T> {
  if (items.length <= limit) return items
  const step = items.length / limit
  return Array.from({ length: limit }, (_, i) => items[Math.floor(i * step)]!)
}

export type LegMatches = {
  origin: Airport
  /** Every airport that matches, uncapped. */
  legs: Array<Leg>
  band: { minNm: number; maxNm: number }
}

export type LegSearchResult = {
  origin: Airport
  /** Candidates for the wheel and the list, thinned to at most MAX_CANDIDATES. */
  legs: Array<Leg>
  /** How many airports matched before thinning. */
  matched: number
  /** True when `legs` is a sample rather than the whole match set. */
  truncated: boolean
  /** Distance band the time bounds work out to, in nautical miles. */
  band: { minNm: number; maxNm: number }
}

/**
 * Every public-use airport reachable from `from` inside the requested one-way
 * time band, with nothing dropped. This is the single definition of "in range";
 * both the candidate list and the map's own in-range set are derived from it, so
 * the two can never disagree about which airports qualify.
 *
 * Returns undefined when the origin identifier is unknown.
 */
export function matchingLegs(query: SpinQuery): LegMatches | undefined {
  const origin = findAirport(query.from)
  if (!origin) return undefined

  const { min, max } = orderedRange(query)
  const minNm = min * query.speed
  const maxNm = max * query.speed
  const box = boundingBox(origin, maxNm)

  const legs: Array<Leg> = []
  for (const airport of db().list) {
    if (airport.id === origin.id) continue
    if (airport.mil) continue
    if (airport.lat < box.minLat || airport.lat > box.maxLat) continue
    if (airport.lon < box.minLon || airport.lon > box.maxLon) continue
    if (query.rwy > 0 && (airport.rwy ?? 0) < query.rwy) continue
    if (query.paved && !airport.paved) continue
    if (query.iap && !airport.iap) continue

    const nm = distanceNm(origin, airport)
    if (nm < minNm || nm > maxNm) continue

    legs.push({
      ...airport,
      distanceNm: Math.round(nm),
      courseDeg: Math.round(bearingDeg(origin, airport)),
      minutes: Math.round((nm / query.speed) * 60),
    })
  }

  legs.sort((a, b) => a.distanceNm - b.distanceNm)
  return { origin, legs, band: { minNm: Math.round(minNm), maxNm: Math.round(maxNm) } }
}

/** The capped view of {@link matchingLegs}, for the wheel and the candidate list. */
export function findLegs(query: SpinQuery): LegSearchResult | undefined {
  const matches = matchingLegs(query)
  if (!matches) return undefined
  return {
    origin: matches.origin,
    legs: spread(matches.legs, MAX_CANDIDATES),
    matched: matches.legs.length,
    truncated: matches.legs.length > MAX_CANDIDATES,
    band: matches.band,
  }
}

/** Identifiers of every airport in range. Small enough to send in full. */
export function inRangeIds(query: SpinQuery): Array<string> {
  return matchingLegs(query)?.legs.map((leg) => leg.id) ?? []
}

/** The one matching airport a `?pick=` refers to, resolved independently of the cap. */
export function findLeg(query: SpinQuery, id: string): Leg | null {
  const wanted = id.trim().toUpperCase()
  return matchingLegs(query)?.legs.find((leg) => leg.id === wanted) ?? null
}

const RUNWAY_LIT = 1
const RUNWAY_APPROX_HEADING = 2
const RUNWAY_PAVED = 4

/** Lazily parsed, keyed by FAA identifier. Both tables are sorted by that column. */
function groupBy<T>(table: string, build: (fields: Array<string>) => T | undefined) {
  const map = new Map<string, Array<T>>()
  for (const line of table.split('\n')) {
    const fields = line.split('|')
    const value = build(fields)
    if (!value) continue
    const key = fields[0]!
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  return map
}

let runwayCache: Map<string, Array<Runway>> | undefined
let frequencyCache: Map<string, Array<Frequency>> | undefined

function isFrequencyType(value: string): value is FrequencyType {
  return (frequencyTypes as ReadonlyArray<string>).includes(value)
}

/** Runways at an airport, longest first. */
export function airportRunways(id: string): Array<Runway> {
  runwayCache ??= groupBy(RUNWAYS_TABLE, ([, le, he, length, width, heading, flags]) => {
    if (!le || !he || heading === undefined) return undefined
    const bits = Number(flags)
    const headingTrue = Number(heading)
    return {
      designator: `${le}/${he}`,
      ends: [
        { ident: le, headingTrue },
        { ident: he, headingTrue: (headingTrue + 180) % 360 },
      ],
      lengthFt: length ? Number(length) : null,
      widthFt: width ? Number(width) : null,
      lit: (bits & RUNWAY_LIT) !== 0,
      paved: (bits & RUNWAY_PAVED) !== 0,
      approximateHeading: (bits & RUNWAY_APPROX_HEADING) !== 0,
    } satisfies Runway
  })
  return [...(runwayCache.get(id) ?? [])].sort((a, b) => (b.lengthFt ?? 0) - (a.lengthFt ?? 0))
}

/** Radio frequencies at an airport, in the order a pilot would use them. */
export function airportFrequencies(id: string): Array<Frequency> {
  frequencyCache ??= groupBy(FREQUENCIES_TABLE, ([, type, mhz, label]) => {
    if (!type || !isFrequencyType(type) || !mhz) return undefined
    return { type, mhz: Number(mhz), label: label ?? '' } satisfies Frequency
  })
  const order = frequencyTypes as ReadonlyArray<string>
  return [...(frequencyCache.get(id) ?? [])].sort(
    (a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.mhz - b.mhz,
  )
}

/**
 * Every public-use civil airport within a radius, as context for the map. This
 * ignores the time band and the destination filters on purpose: an airport that
 * is too close, too short or unpaved still belongs on the chart.
 */
export function airportsNear(center: LatLon, radiusNm: number): Array<MapAirport> {
  const box = boundingBox(center, radiusNm)
  const near: Array<MapAirport> = []
  for (const airport of db().list) {
    if (airport.mil) continue
    if (airport.lat < box.minLat || airport.lat > box.maxLat) continue
    if (airport.lon < box.minLon || airport.lon > box.maxLon) continue
    if (distanceNm(center, airport) > radiusNm) continue
    near.push({ id: airport.id, name: airport.name, lat: airport.lat, lon: airport.lon })
  }
  return near
}

/**
 * States with a public-use airport inside a radius. Used to narrow the TFR
 * lookup, since the FAA index is keyed by state.
 */
export function statesNear(center: LatLon, radiusNm: number): Set<string> {
  const box = boundingBox(center, radiusNm)
  const states = new Set<string>()
  for (const airport of db().list) {
    if (airport.lat < box.minLat || airport.lat > box.maxLat) continue
    if (airport.lon < box.minLon || airport.lon > box.maxLon) continue
    if (airport.state) states.add(airport.state)
  }
  return states
}

/** The closest public-use fields to an airport, for the destination page. */
export function nearbyAirports(origin: Airport, limit = 5): Array<Relative> {
  const box = boundingBox(origin, 40)
  const near: Array<Relative> = []
  for (const airport of db().list) {
    if (airport.id === origin.id || airport.mil) continue
    if (airport.lat < box.minLat || airport.lat > box.maxLat) continue
    if (airport.lon < box.minLon || airport.lon > box.maxLon) continue
    const nm = distanceNm(origin, airport)
    if (nm > 40) continue
    near.push({
      ...airport,
      distanceNm: Math.round(nm),
      courseDeg: Math.round(bearingDeg(origin, airport)),
    })
  }
  return near.sort((a, b) => a.distanceNm - b.distanceNm).slice(0, limit)
}
