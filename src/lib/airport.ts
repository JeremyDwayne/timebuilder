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
  /** How many places to eat are on the field, terminal chains excluded. */
  food: number
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
  /** Longest usable runway in feet. */
  rwy: number | null
  paved: boolean | null
  iap: boolean
  /**
   * On-field eateries outside a terminal, independents first, capped at what a
   * popup can show. Empty at a field the airlines serve, where naming places we
   * cannot place relative to security would contradict both the map mark and
   * the filter.
   */
  food: Array<FoodBrief>
  /** How many there are in all, which can exceed what `food` carries. */
  foodCount: number
  /** How many more sit inside an airline terminal, past security. */
  terminalFood: number
  /** The airlines serve this field, so nothing here counts as a destination. */
  airlineField: boolean
  /**
   * Whether the field earns the burger on the plot. Decided on the server from
   * the same rule the `food` filter uses, rather than re-derived from the list
   * here, so the map can never mark a field the wheel would not draw.
   */
  fieldFood: boolean
}

export const restaurantKinds = ['restaurant', 'cafe', 'fast_food', 'bar', 'pub'] as const
export type RestaurantKind = (typeof restaurantKinds)[number]

export type Restaurant = {
  name: string
  kind: RestaurantKind
  /** "american", "pancake", "thai". Absent for a bit under half of them. */
  cuisine: string | null
  /** Raw OSM opening hours, e.g. "Mo-Su 06:00-15:00". */
  hours: string | null
  phone: string | null
  website: string | null
  /**
   * The month a source last had eyes on the place, as "2026-08". This is the
   * only guard against a restaurant that closed years ago, since nothing tells
   * either dataset when one shuts.
   */
  seen: string | null
  /** Inside an airline terminal, so past security rather than off the ramp. */
  terminal: boolean
  /** A branded chain rather than a field cafe. */
  chain: boolean
  /**
   * Sits at a field the airlines serve. OpenStreetMap cannot reliably say which
   * side of security a place at such a field is on, so none of them count as a
   * destination even though they are all still listed.
   */
  airlineField: boolean
  outdoorSeating: boolean
}

/** Just enough of an eatery to name it in a popup. */
export type FoodBrief = Pick<Restaurant, 'name' | 'kind' | 'hours' | 'chain' | 'seen'>

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** "seen Aug 2026", or null when no source recorded a date. */
export function formatSeen(seen: string | null): string | null {
  if (!seen) return null
  const [year, month] = seen.split('-')
  const name = MONTHS[Number(month) - 1]
  return name && year ? `seen ${name} ${year}` : null
}

/** "fast food" reads as English; the rest of the kinds already do. */
export function formatRestaurantKind(kind: RestaurantKind): string {
  return kind === 'fast_food' ? 'fast food' : kind
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
