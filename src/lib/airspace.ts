/** Airspace shapes and how they are drawn. Shared by the canvas and the legend. */

export const airspaceKinds = ['B', 'C', 'D', 'MOA', 'R', 'P', 'W', 'A'] as const
export type AirspaceKind = (typeof airspaceKinds)[number]

export type AirspaceArea = {
  kind: AirspaceKind
  /** Class letter for controlled airspace, or the published name for special use. */
  label: string
  /** Floor in feet MSL, or null when it starts at the surface. */
  floorFt: number | null
  /** Ceiling in feet MSL, or null when the source gives no usable value. */
  ceilingFt: number | null
  /** Closed ring as flat [lon, lat, lon, lat, ...]. */
  points: Array<number>
}

export type AirspaceStyle = {
  name: string
  stroke: string
  width: number
  /** Canvas dash pattern. Empty is a solid line. */
  dash: Array<number>
}

/**
 * Sectional chart convention: blue for Class B and D and for restricted,
 * prohibited and warning areas; magenta for Class C, MOAs and alert areas. Both
 * hues are lightened from the printed chart so they hold up on a dark ground.
 *
 * Blue against magenta is a hard pair to tell apart, so hue is never the only
 * signal: every kind has its own dash pattern and weight, every area on the map
 * carries a text label, and clicking one names it outright.
 */
const CHART_BLUE = '#6ba4de'
const CHART_MAGENTA = '#e060a8'

export const airspaceStyles: Record<AirspaceKind, AirspaceStyle> = {
  B: { name: 'Class B', stroke: CHART_BLUE, width: 2.4, dash: [] },
  C: { name: 'Class C', stroke: CHART_MAGENTA, width: 1.9, dash: [] },
  D: { name: 'Class D', stroke: CHART_BLUE, width: 1.3, dash: [5, 4] },
  MOA: { name: 'MOA', stroke: CHART_MAGENTA, width: 1.4, dash: [14, 6] },
  R: { name: 'Restricted', stroke: CHART_BLUE, width: 1.9, dash: [9, 3, 2, 3] },
  P: { name: 'Prohibited', stroke: CHART_BLUE, width: 2.8, dash: [9, 3, 2, 3] },
  W: { name: 'Warning', stroke: CHART_BLUE, width: 1.5, dash: [3, 4] },
  A: { name: 'Alert', stroke: CHART_MAGENTA, width: 1.5, dash: [3, 4] },
}

/** Kinds in the order the legend lists them. */
export const legendOrder: ReadonlyArray<AirspaceKind> = ['B', 'C', 'D', 'MOA', 'R', 'P', 'W', 'A']

const hundreds = (feet: number) => String(Math.round(feet / 100))

/**
 * Ceiling over floor in hundreds of feet, the way a sectional prints it.
 * "100/50" is 10,000 down to 5,000; "40/SFC" reaches the ground.
 */
export function altitudeLabel(area: AirspaceArea): string | null {
  if (area.ceilingFt == null) return null
  return `${hundreds(area.ceilingFt)}/${area.floorFt == null ? 'SFC' : hundreds(area.floorFt)}`
}

/** The same limits written out, for a panel rather than a chart label. */
export function altitudeSentence(bounds: {
  floorFt: number | null
  ceilingFt: number | null
}): string {
  const floor = bounds.floorFt == null ? 'Surface' : `${bounds.floorFt.toLocaleString()} ft`
  if (bounds.ceilingFt == null) return `${floor} upward, ceiling not published`
  return `${floor} to ${bounds.ceilingFt.toLocaleString()} ft MSL`
}
