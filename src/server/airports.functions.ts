import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { type } from 'arktype'

import { spinQuery } from '~/lib/search'
import {
  airportFrequencies,
  airportRunways,
  airportsNear,
  findAirport,
  findLeg,
  findLegs,
  inRangeIds,
  nearbyAirports,
  searchAirports,
  statesNear,
} from './airport-db.server'
import { airspaceNear } from './airspace.server'
import { stateOutlines } from './geography.server'
import { tfrsNear } from './tfr.server'
import { fetchMetar } from './weather.server'

/**
 * The only doorway between the browser and the server-only modules above.
 * Everything here is safe to import from any component; the build replaces the
 * handler bodies with RPC stubs in the client bundle.
 */

const identInput = type({ id: type('string').pipe((s) => s.trim().toUpperCase().slice(0, 4)) })

/** Candidate destinations for the current search params. */
export const getLegs = createServerFn({ method: 'GET' })
  .validator(spinQuery)
  .handler(async ({ data }) => {
    if (!data.from) return { origin: null, legs: [], matched: 0, truncated: false, band: null } as const
    const result = findLegs(data)
    if (!result) return { origin: null, legs: [], matched: 0, truncated: false, band: null } as const
    return result
  })

/** Typeahead for the departure field. */
export const suggestAirports = createServerFn({ method: 'GET' })
  .validator(type({ q: 'string' }))
  .handler(async ({ data }) => searchAirports(data.q))

/** Everything the destination page needs up front. */
export const getAirport = createServerFn({ method: 'GET' })
  .validator(identInput)
  .handler(async ({ data }) => {
    const airport = findAirport(data.id)
    if (!airport) throw notFound()
    return {
      airport,
      runways: airportRunways(airport.id),
      frequencies: airportFrequencies(airport.id),
      nearby: nearbyAirports(airport),
    }
  })

/**
 * Everything the map draws underneath the candidates. Airspace and airports are
 * filtered to the plotted radius on the server, so a browser never receives the
 * whole country's geometry.
 *
 * The widest plot the search schema can produce is 12 hours at 400 knots with
 * the map's own margin on top. Anything beyond that is a caller asking for the
 * whole country, which this endpoint exists to avoid sending.
 */
const MAX_RADIUS_NM = 9000
const radiusInput = type(`0 < number <= ${MAX_RADIUS_NM}`)

export const getMapLayers = createServerFn({ method: 'GET' })
  .validator(spinQuery.merge({ radiusNm: radiusInput }))
  .handler(async ({ data }) => {
    const origin = findAirport(data.from)
    return {
      states: stateOutlines(),
      airspace: origin ? airspaceNear(origin, data.radiusNm) : [],
      airports: origin ? airportsNear(origin, data.radiusNm) : [],
      // The complete in-range set, so the map never has to infer membership by
      // subtracting the capped candidate list.
      inRange: origin ? inRangeIds(data) : [],
    }
  })

/**
 * The single airport a `?pick=` refers to, resolved against the full match set
 * rather than the capped candidate list, so a destination chosen on the map
 * still reads correctly on the wheel page.
 */
export const getPickedLeg = createServerFn({ method: 'GET' })
  .validator(spinQuery.merge({ pick: 'string' }))
  .handler(async ({ data }) => (data.pick ? findLeg(data, data.pick) : null))

/**
 * Active temporary flight restrictions near a departure airport. Kept out of the
 * map's loader so a slow FAA feed never holds up the plot; the map asks for this
 * after it has drawn.
 */
export const getTfrs = createServerFn({ method: 'GET' })
  .validator(type({ from: 'string', radiusNm: radiusInput }))
  .handler(async ({ data }) => {
    const origin = findAirport(data.from)
    if (!origin) return { tfrs: [], undrawn: 0, unavailable: false }
    return tfrsNear(origin, data.radiusNm, statesNear(origin, data.radiusNm))
  })

/** Current observation. Deliberately separate so routes can defer it. */
export const getMetar = createServerFn({ method: 'GET' })
  .validator(identInput)
  .handler(async ({ data }) => {
    const airport = findAirport(data.id)
    if (!airport?.icao) return null
    return fetchMetar(airport.icao)
  })
