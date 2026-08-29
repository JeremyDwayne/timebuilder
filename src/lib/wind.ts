import type { Metar, Runway, RunwayEnd } from '~/lib/airport'

/**
 * Runway selection and crosswind components. Everything here works in degrees
 * true, which is what both the METAR wind and the surveyed runway headings use.
 * Runway numbers are magnetic and are only ever labels.
 */

/** Signed difference between two bearings, in the range [-180, 180). */
export function bearingDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

export type WindSolution = {
  end: RunwayEnd
  runway: Runway
  /** Positive is a headwind on landing; negative means you would land downwind. */
  headwindKt: number
  /** Magnitude of the component across the runway. */
  crosswindKt: number
  crosswindFrom: 'left' | 'right'
  /** Angle between the wind and the runway centreline, 0 to 180. */
  angleOffDeg: number
}

/** Every runway end ranked by headwind, best first. Empty when the wind is unusable. */
export function solveRunways(
  runways: ReadonlyArray<Runway>,
  windDirTrue: number,
  windKt: number,
): Array<WindSolution> {
  const solutions: Array<WindSolution> = []
  for (const runway of runways) {
    for (const end of runway.ends) {
      // Wind blows from windDirTrue, so the component along the runway is the
      // cosine of the angle between the runway heading and where the wind is from.
      const delta = bearingDelta(end.headingTrue, windDirTrue)
      const radians = (delta * Math.PI) / 180
      const crosswind = windKt * Math.sin(radians)
      solutions.push({
        end,
        runway,
        headwindKt: Math.round(windKt * Math.cos(radians) * 10) / 10,
        crosswindKt: Math.round(Math.abs(crosswind) * 10) / 10,
        crosswindFrom: crosswind >= 0 ? 'right' : 'left',
        angleOffDeg: Math.round(Math.abs(delta)),
      })
    }
  }
  return solutions.sort((a, b) => b.headwindKt - a.headwindKt)
}

/**
 * The runway end the wind favours, or null when the report gives no usable
 * direction: calm, variable, or a missing wind group.
 */
export function favouredRunway(
  runways: ReadonlyArray<Runway>,
  report: Pick<Metar, 'windDir' | 'windKt'> | null,
): WindSolution | null {
  if (!report || typeof report.windDir !== 'number') return null
  if (!report.windKt || report.windKt < 1) return null
  return solveRunways(runways, report.windDir, report.windKt)[0] ?? null
}
