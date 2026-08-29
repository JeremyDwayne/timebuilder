/**
 * How many labels the map prints at once.
 *
 * Collision avoidance alone only stops labels overlapping, and a wide time band
 * can hold several hundred fields that all fit somewhere. Naming every one of
 * them turns the plot into a wall of identifiers with the chart lost underneath.
 * The budget caps how many are printed at all, so zooming in is what reveals
 * more, the way unfolding a sectional does.
 *
 * Scaled by canvas area, so a phone is not handed a desktop's worth of text, and
 * by zoom, so a close-in view names very nearly everything on it.
 */

/** A comfortable desktop plot, against which every other canvas is measured. */
const REFERENCE_AREA_PX = 900 * 560
const AIRPORTS_AT_REST = 30
/** Extra airport labels bought by each doubling of the zoom. */
const AIRPORTS_PER_DOUBLING = 16
/** Enough to stay useful on the smallest phone at the widest zoom. */
const MIN_AIRPORTS = 6
/** Airspace takes a smaller share; the legend and a click carry the rest. */
const AIRSPACE_SHARE = 0.45
const MIN_AIRSPACE = 3

export type LabelBudget = {
  /** Airport identifiers, not counting the origin or whatever is picked or hovered. */
  airports: number
  /** Airspace annotations, largest area first. */
  airspace: number
}

/**
 * The budget for a canvas of this size at this zoom.
 *
 * A canvas with no area and a zoom at or below zero are both meaningless, and
 * either one alone falls out as the minimum. Together they used to multiply an
 * infinity by a zero and hand back NaN, which would have cost every label on the
 * plot, so anything that does not come out finite falls back to the minimum.
 */
export function labelBudget(widthPx: number, heightPx: number, zoom: number): LabelBudget {
  const area = Math.max(0, widthPx * heightPx) / REFERENCE_AREA_PX
  const scaled = (AIRPORTS_AT_REST + AIRPORTS_PER_DOUBLING * Math.log2(zoom)) * area
  const airports =
    Number.isFinite(scaled) ? Math.max(MIN_AIRPORTS, Math.round(scaled)) : MIN_AIRPORTS
  return {
    airports,
    airspace: Math.max(MIN_AIRSPACE, Math.round(airports * AIRSPACE_SHARE)),
  }
}
