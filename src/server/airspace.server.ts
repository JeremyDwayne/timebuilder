import '@tanstack/react-start/server-only'

import { AIRSPACE_TABLE } from '~/data/airspace.generated'
import { airspaceKinds, type AirspaceArea, type AirspaceKind } from '~/lib/airspace'
import { boundingBox, type LatLon } from '~/lib/geo'

/**
 * Class B, C and D surface areas plus special-use airspace. The whole country is
 * a few hundred kilobytes of geometry, so it is filtered to the requested view
 * here rather than shipped to the browser.
 */

type Indexed = AirspaceArea & {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

let cache: Array<Indexed> | undefined

function isKind(value: string): value is AirspaceKind {
  return (airspaceKinds as ReadonlyArray<string>).includes(value)
}

function parse(): Array<Indexed> {
  const areas: Array<Indexed> = []
  for (const line of AIRSPACE_TABLE.split('\n')) {
    const [kind, label, floor, ceiling, box, encoded] = line.split('|') as [
      string, string, string, string, string, string,
    ]
    if (!isKind(kind)) continue

    const [minLon, minLat, maxLon, maxLat] = box.split(',').map(Number) as [
      number, number, number, number,
    ]

    // Points are deltas in thousandths of a degree, about 60 metres.
    const points: Array<number> = []
    let lon = 0
    let lat = 0
    for (const pair of encoded.split(' ')) {
      const comma = pair.indexOf(',')
      lon += Number(pair.slice(0, comma))
      lat += Number(pair.slice(comma + 1))
      points.push(lon / 1000, lat / 1000)
    }

    areas.push({
      kind,
      label,
      floorFt: floor === '' ? null : Number(floor),
      ceilingFt: ceiling === '' ? null : Number(ceiling),
      points,
      minLon,
      minLat,
      maxLon,
      maxLat,
    })
  }
  return areas
}

/** Every area whose extent overlaps a radius around a point. */
export function airspaceNear(center: LatLon, radiusNm: number): Array<AirspaceArea> {
  cache ??= parse()
  const box = boundingBox(center, radiusNm)

  const near: Array<AirspaceArea> = []
  for (const area of cache) {
    if (area.maxLon < box.minLon || area.minLon > box.maxLon) continue
    if (area.maxLat < box.minLat || area.minLat > box.maxLat) continue
    near.push({
      kind: area.kind,
      label: area.label,
      floorFt: area.floorFt,
      ceilingFt: area.ceilingFt,
      points: area.points,
    })
  }
  return near
}
