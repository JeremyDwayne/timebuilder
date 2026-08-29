/**
 * Temporary flight restrictions.
 *
 * The list of TFRs in range is authoritative and comes straight from the FAA
 * feed. The drawn shapes are a convenience: any restriction whose geometry this
 * app cannot read is still listed, and the count of undrawn shapes is shown, so
 * the map never implies it holds everything.
 */

/**
 * One closed boundary of a restriction, with the limits published for that
 * boundary. A multi-part TFR gives each part its own floor and ceiling.
 */
export type TfrPart = {
  /** Closed ring as flat [lon, lat, ...]. */
  ring: Array<number>
  floorFt: number | null
  ceilingFt: number | null
}

export type Tfr = {
  /** NOTAM number, e.g. "6/8902". */
  notamId: string
  /** Feed category: HAZARDS, SECURITY, VIP, SPACE OPERATIONS and so on. */
  type: string
  description: string
  state: string
  /** Nationwide restrictions carry no single state. */
  nationwide: boolean
  /** Empty when the shape could not be read. */
  parts: Array<TfrPart>
}

/**
 * True when a feed entry's state field does not name one state. The index uses
 * "USA" for nationwide restrictions and leaves the field blank on some others,
 * so anything that is not a two-letter code has to be treated as nationwide:
 * narrowing on a state set alone drops every nationwide security notice.
 */
export function isNationwide(state: string): boolean {
  return !/^[A-Z]{2}$/.test(state.trim().toUpperCase())
}

export type TfrReport = {
  tfrs: Array<Tfr>
  /** Listed restrictions whose geometry this parser could not turn into a shape. */
  undrawn: number
  /** The FAA feed could not be reached, so nothing here can be trusted as complete. */
  unavailable: boolean
}

export const tfrStyle = {
  stroke: '#ff4d6d',
  fill: 'rgba(255, 77, 109, 0.13)',
  width: 2,
} as const
