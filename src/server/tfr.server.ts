import '@tanstack/react-start/server-only'

import { type LatLon } from '~/lib/geo'
import { arc, circle, ringWithinRange } from '~/lib/ring'
import { isNationwide, type Tfr, type TfrReport } from '~/lib/tfr'
import { createTtlCache } from './cache.server'

/**
 * Live TFR lookups against the FAA feed.
 *
 * Two outbound endpoints: one index of every active restriction, and one detail
 * document per NOTAM. Both are cached, details are only pulled for the states in
 * view, and requests run a few at a time, so a page view costs the FAA very
 * little and a cold cache costs it a few dozen small documents at most.
 */

const LIST_URL = 'https://tfr.faa.gov/tfrapi/exportTfrList'
const DETAIL_URL = 'https://tfr.faa.gov/download'
/**
 * Deliberately short. On a serverless host the whole request runs under a
 * function ceiling that starts at ten seconds, and this call is one of several
 * the handler makes. An unreachable feed is reported to the pilot as such, which
 * is far better than the request dying against the ceiling with nothing said.
 */
const TIMEOUT_MS = 5_000
const CONCURRENCY = 4
const USER_AGENT = 'TimeBuilder/1.0 (general aviation trip planner)'

/** New restrictions appear on the index within minutes; shapes never change. */
const LIST_TTL_MS = 10 * 60_000
const DETAIL_TTL_MS = 60 * 60_000

type ListEntry = {
  notam_id?: string
  type?: string
  description?: string
  state?: string
}

/** One closed boundary with the vertical limits published for that boundary. */
type Part = {
  ring: Array<number>
  floorFt: number | null
  ceilingFt: number | null
}

type Shape = {
  parts: Array<Part>
}

const listCache = createTtlCache<Array<ListEntry> | null>({
  ttlMs: LIST_TTL_MS,
  emptyTtlMs: 60_000,
  maxEntries: 1,
})

const detailCache = createTtlCache<Shape | null>({
  ttlMs: DETAIL_TTL_MS,
  emptyTtlMs: 5 * 60_000,
  maxEntries: 400,
})

function request(url: string) {
  return fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT },
  })
}

/** "121.53333333W" to -121.53333333. */
function coordinate(text: string | undefined, negativeHemisphere: 'S' | 'W'): number | null {
  const match = /^([\d.]+)\s*([NSEW])$/.exec((text ?? '').trim())
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  return match[2] === negativeHemisphere ? -value : value
}

function tag(block: string, name: string): string | undefined {
  return new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1]
}

/**
 * A vertex nests reference-point blocks that repeat geoLat and geoLong, so they
 * are stripped before any tag is read.
 */
function directChildren(block: string): string {
  return block.replace(/<Frd>[\s\S]*?<\/Frd>/g, '')
}

/** Feet MSL, or null for a surface floor or a bound the document does not give. */
function altitude(block: string, bound: 'Upper' | 'Lower'): number | null {
  const value = Number(tag(block, `valDistVer${bound}`))
  const uom = tag(block, `uomDistVer${bound}`)
  if (!Number.isFinite(value) || uom !== 'FT' || value <= 0) return null
  return Math.round(value)
}

/**
 * Pulls closed rings out of an FAA XNOTAM document. Handles the two vertex kinds
 * the feed actually uses, great-circle points and circles; anything else yields
 * no ring and the caller reports it as undrawn.
 */
type Point = LatLon

type Vertex =
  | { kind: 'point'; point: Point }
  | { kind: 'circle'; point: Point; radiusNm: number }
  | { kind: 'arc'; centre: Point; clockwise: boolean }

function readVertex(block: string): Vertex | null {
  const flat = directChildren(block)
  const kind = tag(flat, 'codeType')

  if (kind === 'CWA' || kind === 'CCA') {
    const lat = coordinate(tag(flat, 'geoLatArc'), 'S')
    const lon = coordinate(tag(flat, 'geoLongArc'), 'W')
    if (lat == null || lon == null) return null
    return { kind: 'arc', centre: { lat, lon }, clockwise: kind === 'CWA' }
  }

  const lat = coordinate(tag(flat, 'geoLat'), 'S')
  const lon = coordinate(tag(flat, 'geoLong'), 'W')
  if (lat == null || lon == null) return null

  if (kind === 'CIR') {
    const radiusNm = Number(tag(flat, 'valRadiusArc'))
    if (tag(flat, 'uomRadiusArc') !== 'NM' || !(radiusNm > 0)) return null
    return { kind: 'circle', point: { lat, lon }, radiusNm }
  }
  if (kind !== 'GRC') return null
  return { kind: 'point', point: { lat, lon } }
}

/**
 * The airspace block a boundary sits inside, which is where that boundary's own
 * vertical limits live. Falls back to the boundary itself when the surrounding
 * block cannot be located.
 */
function enclosingBlock(xml: string, boundary: string): string {
  const end = xml.indexOf(boundary)
  if (end < 0) return boundary
  const start = xml.lastIndexOf('<Ase>', end)
  return start < 0 ? boundary : xml.slice(start, end + boundary.length)
}

/**
 * Pulls closed rings out of an FAA XNOTAM document. Straight segments, whole
 * circles and arcs are all handled; an arc vertex carries only its centre and
 * sweeps between the vertices either side of it.
 */
function parseShape(xml: string): Shape | null {
  const parts: Array<Part> = []
  // A multi-part restriction publishes a different floor and ceiling for each
  // part, so the limits are read from the boundary and only fall back to the
  // document when the boundary itself carries none.
  const documentFloor = altitude(xml, 'Lower')
  const documentCeiling = altitude(xml, 'Upper')

  for (const boundary of xml.match(/<Abd>[\s\S]*?<\/Abd>/g) ?? []) {
    const enclosing = enclosingBlock(xml, boundary)
    const floorFt = altitude(enclosing, 'Lower') ?? documentFloor
    const ceilingFt = altitude(enclosing, 'Upper') ?? documentCeiling
    const vertices = (boundary.match(/<Avx>[\s\S]*?<\/Avx>/g) ?? [])
      .map(readVertex)
      .filter((vertex): vertex is Vertex => vertex !== null)

    const circular = vertices.find((vertex) => vertex.kind === 'circle')
    if (circular?.kind === 'circle') {
      parts.push({
        ring: circle(circular.point.lat, circular.point.lon, circular.radiusNm),
        floorFt,
        ceilingFt,
      })
      continue
    }

    const ring: Array<number> = []
    vertices.forEach((vertex, index) => {
      if (vertex.kind === 'point') {
        ring.push(vertex.point.lon, vertex.point.lat)
        return
      }
      if (vertex.kind !== 'arc') return
      const previous = vertices[index - 1]
      const next = vertices[index + 1]
      if (previous?.kind !== 'point' || next?.kind !== 'point') return
      ring.push(...arc(vertex.centre, previous.point, next.point, vertex.clockwise))
    })

    if (ring.length >= 6) parts.push({ ring, floorFt, ceilingFt })
  }

  return parts.length > 0 ? { parts } : null
}

async function fetchShape(notamId: string): Promise<Shape | null> {
  return detailCache.get(notamId, async () => {
    try {
      const response = await request(`${DETAIL_URL}/detail_${notamId.replace('/', '_')}.xml`)
      if (!response.ok) return null
      return parseShape(await response.text())
    } catch {
      return null
    }
  })
}

async function fetchList(): Promise<Array<ListEntry> | null> {
  return listCache.get('all', async () => {
    try {
      const response = await request(LIST_URL)
      if (!response.ok) return null
      const body = await response.json()
      return Array.isArray(body) ? (body as Array<ListEntry>) : null
    } catch {
      return null
    }
  })
}

/** Runs the tasks a few at a time so the feed never sees a burst. */
async function pooled<T, R>(items: Array<T>, run: (item: T) => Promise<R>): Promise<Array<R>> {
  const results: Array<R> = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index]!)
    }
  })
  await Promise.all(workers)
  return results
}

/** Nautical miles from a point to a segment, in a local flat frame. */
/** True when any part of the shape reaches the radius. */
function withinRange(shape: Shape, center: LatLon, radiusNm: number): boolean {
  return shape.parts.some((part) => ringWithinRange(part.ring, center, radiusNm))
}

/**
 * Active restrictions around a point.
 *
 * The FAA index is keyed by state, so the candidate set is every restriction in
 * the states the plot covers. Those with a readable shape are then narrowed to
 * the ones that actually reach the radius. Those without a shape are all kept,
 * because there is no safe way to rule them out, and they are reported so the
 * map never looks more complete than it is.
 */
export async function tfrsNear(
  center: LatLon,
  radiusNm: number,
  states: ReadonlySet<string>,
): Promise<TfrReport> {
  const list = await fetchList()
  if (!list) return { tfrs: [], undrawn: 0, unavailable: true }

  const candidates = list.filter((entry) => {
    if (!entry.notam_id) return false
    const state = (entry.state ?? '').trim().toUpperCase()
    return isNationwide(state) || states.has(state)
  })

  const shapes = await pooled(candidates, (entry) => fetchShape(entry.notam_id!))

  let undrawn = 0
  const tfrs: Array<Tfr> = []
  candidates.forEach((entry, index) => {
    const shape = shapes[index]
    // A generous margin, since the radius is the plot's outer ring and a
    // restriction just outside it still matters on the way there.
    if (shape && !withinRange(shape, center, radiusNm * 1.15)) return
    if (!shape) undrawn++
    const state = (entry.state ?? '').trim()
    tfrs.push({
      notamId: entry.notam_id!,
      type: (entry.type ?? '').trim(),
      description: (entry.description ?? '').trim(),
      state,
      nationwide: isNationwide(state),
      parts: shape?.parts ?? [],
    })
  })

  return { tfrs, undrawn, unavailable: false }
}
