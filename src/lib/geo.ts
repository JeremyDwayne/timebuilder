/** Great-circle math on the WGS-84 mean radius, in nautical miles. */

export type LatLon = { lat: number; lon: number }

const EARTH_RADIUS_NM = 3440.065
const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Great-circle distance in nautical miles. */
export function distanceNm(from: LatLon, to: LatLon): number {
  const dLat = toRad(to.lat - from.lat)
  const dLon = toRad(to.lon - from.lon)
  const lat1 = toRad(from.lat)
  const lat2 = toRad(to.lat)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return EARTH_RADIUS_NM * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Initial true course from one point to another, in degrees 0-359. */
export function bearingDeg(from: LatLon, to: LatLon): number {
  const lat1 = toRad(from.lat)
  const lat2 = toRad(to.lat)
  const dLon = toRad(to.lon - from.lon)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const

export type CompassPoint = (typeof POINTS)[number]

/** Nearest 16-point compass label for a true bearing. */
export function compassPoint(deg: number): CompassPoint {
  return POINTS[Math.round((deg % 360) / 22.5) % 16]!
}

/**
 * Cheap latitude/longitude box that fully contains a radius in nautical miles.
 * Used to reject far-away airports before paying for the haversine.
 */
export function boundingBox(center: LatLon, radiusNm: number) {
  const dLat = radiusNm / 60
  const cos = Math.cos(toRad(center.lat))
  const dLon = radiusNm / (60 * Math.max(0.01, Math.abs(cos)))
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLon: center.lon - dLon,
    maxLon: center.lon + dLon,
  }
}
