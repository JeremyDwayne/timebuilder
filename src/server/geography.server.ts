import '@tanstack/react-start/server-only'

import { STATE_RINGS_TABLE } from '~/data/state-rings.generated'
import { STATE_LABELS_TABLE } from '~/data/state-labels.generated'

/**
 * US state outlines for the map. Kept out of the client bundle and handed over
 * by the map route's own loader, so the wheel never pays for geometry it does
 * not draw.
 */

export type StateOutlines = {
  /** Closed rings as flat [lon, lat, lon, lat, ...], which serialises smaller than tuples. */
  rings: Array<Array<number>>
  labels: Array<{ code: string; lon: number; lat: number }>
}

let cache: StateOutlines | undefined

export function stateOutlines(): StateOutlines {
  if (cache) return cache

  const rings = STATE_RINGS_TABLE.split('\n').map((line) => {
    const flat: Array<number> = []
    let lon = 0
    let lat = 0
    for (const pair of line.split(' ')) {
      const comma = pair.indexOf(',')
      // Stored as deltas in hundredths of a degree.
      lon += Number(pair.slice(0, comma))
      lat += Number(pair.slice(comma + 1))
      flat.push(lon / 100, lat / 100)
    }
    return flat
  })

  const labels = STATE_LABELS_TABLE.split('\n').map((line) => {
    const [code, lon, lat] = line.split('|') as [string, string, string]
    return { code, lon: Number(lon), lat: Number(lat) }
  })

  cache = { rings, labels }
  return cache
}
