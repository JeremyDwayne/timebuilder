/** Shared, client-safe airport shapes. The dataset itself never leaves the server. */

export type Airport = {
  /** FAA location identifier, e.g. "SQL". Stable primary key across the app. */
  id: string
  /** ICAO identifier when one is assigned, e.g. "KSQL". */
  icao: string | null
  name: string
  city: string
  state: string
  lat: number
  lon: number
  /** Field elevation in feet MSL. */
  elev: number | null
  /** A published instrument approach exists. */
  iap: boolean
  /** Joint-use or military field. Not a routine GA destination. */
  mil: boolean
  /** Longest usable runway in feet. */
  rwy: number | null
  paved: boolean | null
  lit: boolean | null
}

/** An airport positioned relative to some origin. */
export type Relative = Airport & {
  distanceNm: number
  /** Initial true course from the origin. */
  courseDeg: number
}

/** A destination reachable from the origin, with the leg already solved. */
export type Leg = Relative & {
  /** One-way block time in minutes at the requested cruise speed. */
  minutes: number
}

/**
 * Just enough of an airport to draw and name it. The map plots every public-use
 * field in view, not only the ones inside the time band, so a towered field or a
 * Class D circle is never left looking empty.
 */
export type MapAirport = {
  id: string
  name: string
  lat: number
  lon: number
}

/** One end of a runway. Idents are magnetic, headings are true. */
export type RunwayEnd = {
  /** Painted number, e.g. "29" or "35R". */
  ident: string
  headingTrue: number
}

export type Runway = {
  /** Both ends as painted, e.g. "11/29". */
  designator: string
  ends: [RunwayEnd, RunwayEnd]
  lengthFt: number | null
  widthFt: number | null
  lit: boolean
  paved: boolean
  /**
   * True heading was taken from the runway number rather than a survey, so it
   * carries the local magnetic variation as error.
   */
  approximateHeading: boolean
}

export const frequencyTypes = [
  'CTAF', 'TWR', 'GND', 'CLD', 'UNIC', 'ATIS', 'AWOS', 'ASOS', 'AFIS',
] as const
export type FrequencyType = (typeof frequencyTypes)[number]

export type Frequency = {
  type: FrequencyType
  mhz: number
  label: string
}

export const flightRules = ['VFR', 'MVFR', 'IFR', 'LIFR'] as const
export type FlightRules = (typeof flightRules)[number]

export type Metar = {
  raw: string
  observedAt: string
  /** Ceiling and visibility category, when the report is complete enough to classify. */
  rules: FlightRules | null
  windDir: number | 'VRB' | null
  windKt: number | null
  visibility: string | null
  tempC: number | null
  altimeterInHg: number | null
}

/** "1h 25m", or "45m" under the hour. */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`
}

export function formatAirportLabel(airport: Airport): string {
  return `${airport.id} ${airport.name}`
}

/** "118.600", the form pilots read off a chart. */
export function formatFrequency(mhz: number): string {
  return mhz.toFixed(3)
}
