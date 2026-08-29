import { distanceNm, type LatLon } from '~/lib/geo'

/**
 * Flat `[lon, lat, lon, lat, ...]` rings and the plane geometry over them.
 *
 * Everything here works in degrees on a locally flat plane, with longitude
 * scaled by the cosine of latitude. That is accurate enough over the tens of
 * nautical miles a restriction or an airspace ring spans, and it keeps the hot
 * loops free of trigonometry.
 */

export type Ring = Array<number>

const CIRCLE_STEPS = 48
/** One arc point per this many degrees of sweep. */
const ARC_STEP_DEG = 5

/** Longitude degrees per latitude degree at a given latitude, floored near the poles. */
function lonScale(lat: number): number {
  return Math.max(0.05, Math.cos((lat * Math.PI) / 180))
}

/** A closed ring approximating a circle of `radiusNm` around a point. */
export function circle(lat: number, lon: number, radiusNm: number): Ring {
  const dLat = radiusNm / 60
  const dLon = dLat / lonScale(lat)
  const points: Ring = []
  for (let i = 0; i <= CIRCLE_STEPS; i++) {
    const a = (i / CIRCLE_STEPS) * Math.PI * 2
    points.push(lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat)
  }
  return points
}

/**
 * Points along an arc centred on `centre`, running from one boundary vertex to
 * the next. Longitude is scaled by the cosine of latitude so the sweep is round
 * on the ground; the radius is interpolated between the two endpoints so the arc
 * always meets them exactly.
 *
 * Clockwise on a north-up map is a decreasing mathematical angle. The endpoints
 * themselves are not emitted, since the caller already has them.
 */
export function arc(centre: LatLon, from: LatLon, to: LatLon, clockwise: boolean): Ring {
  const kx = lonScale(centre.lat)
  const local = (p: LatLon) => ({ x: (p.lon - centre.lon) * kx, y: p.lat - centre.lat })
  const a = local(from)
  const b = local(to)
  const startAngle = Math.atan2(a.y, a.x)
  const endAngle = Math.atan2(b.y, b.x)
  const startRadius = Math.hypot(a.x, a.y)
  const endRadius = Math.hypot(b.x, b.y)

  let sweep = endAngle - startAngle
  if (clockwise) {
    while (sweep > 0) sweep -= Math.PI * 2
    if (sweep < -Math.PI * 2) sweep += Math.PI * 2
  } else {
    while (sweep < 0) sweep += Math.PI * 2
    if (sweep > Math.PI * 2) sweep -= Math.PI * 2
  }

  const steps = Math.max(4, Math.ceil((Math.abs(sweep) * 180) / Math.PI / ARC_STEP_DEG))
  const points: Ring = []
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const angle = startAngle + sweep * t
    const radius = startRadius + (endRadius - startRadius) * t
    points.push(centre.lon + (Math.cos(angle) * radius) / kx, centre.lat + Math.sin(angle) * radius)
  }
  return points
}

/** Nautical miles from a point to the segment `a`-`b`. */
export function distanceToSegment(
  point: LatLon,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const kx = lonScale(point.lat)
  const px = (point.lon - ax) * kx
  const py = point.lat - ay
  const dx = (bx - ax) * kx
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSq))
  return Math.hypot(px - t * dx, py - t * dy) * 60
}

/** Ray casting against a flat ring. */
export function ringContains(ring: Ring, point: LatLon): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!
    const yi = ring[i + 1]!
    const xj = ring[j]!
    const yj = ring[j + 1]!
    if (
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

/**
 * True when any part of the ring lies inside `radiusNm` of the centre.
 *
 * Testing vertices alone is wrong twice over: a long edge can cross the plot
 * with both of its endpoints outside it, and a large area can enclose the centre
 * entirely while every vertex sits beyond the radius. Edges and containment are
 * both checked.
 */
export function ringWithinRange(ring: Ring, center: LatLon, radiusNm: number): boolean {
  if (ring.length < 4) return false
  if (ringContains(ring, center)) return true
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length
    if (distanceNm(center, { lon: ring[i]!, lat: ring[i + 1]! }) <= radiusNm) return true
    if (distanceToSegment(center, ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!) <= radiusNm) {
      return true
    }
  }
  return false
}
