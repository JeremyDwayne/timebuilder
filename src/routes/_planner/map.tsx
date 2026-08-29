import { Link, createFileRoute, useLoaderData, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  airspaceStyles,
  altitudeLabel,
  altitudeSentence,
  legendOrder,
  type AirspaceArea,
  type AirspaceKind,
} from '~/lib/airspace'
import { bearingDeg, compassPoint, distanceNm, type LatLon } from '~/lib/geo'
import { labelBudget } from '~/lib/map-labels'
import {
  formatMinutes,
  formatRestaurantKind,
  formatSeen,
  type Airport,
  type MapAirport,
} from '~/lib/airport'
import { FoodMark, foodMarkPath } from '~/components/FoodMark'
import { tfrStyle, type Tfr, type TfrPart, type TfrReport } from '~/lib/tfr'
import { getMapLayers, getTfrs } from '~/server/airports.functions'

/**
 * `data-only`: the loaders still run on the server so the candidate set and the
 * map layers are in the first payload, but the component is skipped during SSR
 * because it sizes itself against the DOM and paints to a canvas.
 */

/** Extra reach fetched beyond the outer ring, so zooming out is not empty. */
const FETCH_MARGIN = 1.8

export const Route = createFileRoute('/_planner/map')({
  ssr: 'data-only',
  loaderDeps: ({ search: { from, min, max, speed, rwy, paved, iap, food } }) => ({
    from,
    min,
    max,
    speed,
    rwy,
    paved,
    iap,
    food,
    radiusNm: Math.ceil(Math.max(min, max) * speed),
  }),
  loader: ({ deps }) =>
    deps.from
      ? getMapLayers({
          data: { ...deps, radiusNm: Math.ceil(deps.radiusNm * FETCH_MARGIN) },
        })
      : {
          states: { rings: [], labels: [] },
          airspace: [],
          airports: [],
          inRange: [] as Array<string>,
        },
  // Boundaries and published airspace change on the 56-day cycle, not per visit.
  staleTime: 30 * 60_000,
  component: MapPage,
})

const PADDING = 26
/** An area smaller than this on screen is drawn without a label. */
const LABEL_MIN_PX = 30
const ALTITUDE_MIN_PX = 58

/** How far inside the top edge an airspace annotation sits when the centre is taken. */
const AIRSPACE_LABEL_INSET_PX = 12
const MIN_ZOOM = 0.6
const MAX_ZOOM = 8
const ZOOM_STEP = 1.5
/** Pointer travel past which a press counts as a pan rather than a click. */
const DRAG_THRESHOLD_PX = 4
/**
 * Width of the burger drawn above a field that has somewhere to eat. Fixed
 * rather than scaled with zoom, the way the dots are, so it stays legible at the
 * widest plot and never grows into the field beside it.
 */
const FOOD_MARK_PX = 9

/** Plot-frame offset in nautical miles, north up, from an azimuthal projection. */
function project(origin: LatLon, point: LatLon): [number, number] {
  const d = distanceNm(origin, point)
  const a = ((bearingDeg(origin, point) - 90) * Math.PI) / 180
  return [Math.cos(a) * d, Math.sin(a) * d]
}

type ProjectedRing = {
  points: Float64Array
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function projectRing(origin: LatLon, flat: ArrayLike<number>): ProjectedRing {
  const points = new Float64Array(flat.length)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < flat.length; i += 2) {
    const [dx, dy] = project(origin, { lon: flat[i]!, lat: flat[i + 1]! })
    points[i] = dx
    points[i + 1] = dy
    if (dx < minX) minX = dx
    if (dx > maxX) maxX = dx
    if (dy < minY) minY = dy
    if (dy > maxY) maxY = dy
  }
  return { points, minX, minY, maxX, maxY }
}

/** Ray casting against a flat [x, y, x, y, ...] ring. */
function inRing(ring: ProjectedRing, x: number, y: number): boolean {
  if (x < ring.minX || x > ring.maxX || y < ring.minY || y > ring.maxY) return false
  const p = ring.points
  let inside = false
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i]!
    const yi = p[i + 1]!
    const xj = p[j]!
    const yj = p[j + 1]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** A field on the plot, with its leg already solved and its range settled. */
type PlottedAirport = {
  airport: MapAirport
  dx: number
  dy: number
  distanceNm: number
  courseDeg: number
  minutes: number
  inRange: boolean
}

type Hit =
  | { sort: 'airspace'; area: AirspaceArea }
  | { sort: 'tfr'; tfr: Tfr; part: TfrPart }
  /** Any public-use field, whether the time band takes it in or leaves it out. */
  | { sort: 'airport'; entry: PlottedAirport }

type Popup = { x: number; y: number; hits: Array<Hit> }

function MapPage() {
  const search = Route.useSearch()
  const { radiusNm } = Route.useLoaderDeps()
  const { origin, legs, band } = useLoaderData({ from: '/_planner' })
  const layers = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })
  const requestTfrs = useServerFn(getTfrs)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<PlottedAirport | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<AirspaceKind>>(new Set())
  const [showTfrs, setShowTfrs] = useState(true)
  const [tfrs, setTfrs] = useState<TfrReport | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [grabbing, setGrabbing] = useState(false)
  const [popup, setPopup] = useState<Popup | null>(null)
  const placed = useRef<Array<{ entry: PlottedAirport; x: number; y: number }>>([])
  /** Set on pointer down, and how far the pointer has travelled since. */
  const drag = useRef<{
    x: number
    y: number
    from: { x: number; y: number }
    moved: number
    /** Capture is taken only once a press turns into a drag, and always released. */
    captured: boolean
  } | null>(null)

  /**
   * Every field in view, with range membership taken from the server's own
   * matcher rather than inferred by subtracting the candidate list. The list is
   * capped for the wheel; range is not, so deriving one from the other used to
   * paint in-range airports as excluded.
   */
  const plotted = useMemo(() => {
    if (!origin) return []
    const inRange = new Set(layers.inRange)
    return layers.airports
      .filter((airport) => airport.id !== origin.id)
      .map((airport) => {
        const [dx, dy] = project(origin, airport)
        const distanceNm = Math.round(Math.hypot(dx, dy))
        return {
          airport,
          dx,
          dy,
          distanceNm,
          courseDeg: Math.round(bearingDeg(origin, airport)),
          minutes: Math.round((distanceNm / search.speed) * 60),
          inRange: inRange.has(airport.id),
        }
      })
  }, [origin, layers, search.speed])

  const picked = plotted.find((entry) => entry.airport.id === search.pick) ?? null

  // Asked for after the first paint rather than in the loader, so a slow or
  // unreachable FAA feed cannot hold up the plot.
  useEffect(() => {
    if (!origin) return
    let live = true
    setTfrs(null)
    requestTfrs({ data: { from: origin.id, radiusNm } })
      .then((report) => live && setTfrs(report))
      .catch(() => live && setTfrs({ tfrs: [], undrawn: 0, unavailable: true }))
    return () => {
      live = false
    }
  }, [origin, radiusNm, requestTfrs])

  // Changing the plot invalidates anything the popup was pointing at. `layers`
  // covers the destination filters too: without it, toggling one left a popup
  // holding a stale entry, still offering to pick a field the filter had just
  // excluded, which set a `?pick=` that resolves to nothing.
  useEffect(() => setPopup(null), [origin, radiusNm, zoom, layers])

  // A new plot starts centred again.
  useEffect(() => setPan({ x: 0, y: 0 }), [origin, radiusNm])

  // The great-circle maths only depends on where you are departing from, so it
  // is paid once per origin rather than on every hover repaint.
  const geography = useMemo(() => {
    if (!origin) return null
    return {
      states: layers.states.rings.map((flat) => projectRing(origin, flat)),
      labels: layers.states.labels.map((label) => ({
        code: label.code,
        point: project(origin, label),
      })),
      airspace: layers.airspace.map((area) => ({
        area,
        ring: projectRing(origin, area.points),
      })),
    }
  }, [origin, layers])



  const tfrShapes = useMemo(() => {
    if (!origin || !tfrs) return []
    return tfrs.tfrs.flatMap((tfr) =>
      tfr.parts.map((part) => ({ tfr, part, ring: projectRing(origin, part.ring) })),
    )
  }, [origin, tfrs])

  const visibleAirspace = useMemo(
    () => geography?.airspace.filter(({ area }) => !hidden.has(area.kind)) ?? [],
    [geography, hidden],
  )

  /** Pixels per nautical mile at the current zoom, and where the origin sits. */
  const frame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !band) return null
    const box = canvas.getBoundingClientRect()
    const base = (Math.min(box.width, box.height) / 2 - PADDING) / band.maxNm
    return {
      box,
      cx: box.width / 2 + pan.x,
      cy: box.height / 2 + pan.y,
      scale: base * zoom,
    }
  }, [band, zoom, pan])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !band || !geography || !origin) return

    const draw = () => {
      const view = frame()
      if (!view) return
      const { box, cx, cy, scale } = view
      const dpr = window.devicePixelRatio || 1
      canvas.width = box.width * dpr
      canvas.height = box.height * dpr
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, box.width, box.height)

      // Geometry is clipped just past the canvas edge in screen space, so the
      // draw stays cheap and panning never clips the side you are moving toward.
      const MARGIN = 240
      const offScreen = (x: number, y: number) =>
        x < -MARGIN || x > box.width + MARGIN || y < -MARGIN || y > box.height + MARGIN
      const onScreen = (x: number, y: number) =>
        x >= -8 && x <= box.width + 8 && y >= -8 && y <= box.height + 8
      const boxOffScreen = (ring: ProjectedRing) =>
        cx + ring.minX * scale > box.width + MARGIN ||
        cx + ring.maxX * scale < -MARGIN ||
        cy + ring.minY * scale > box.height + MARGIN ||
        cy + ring.maxY * scale < -MARGIN

      const trace = (ring: ProjectedRing, close: boolean) => {
        ctx.beginPath()
        let drawing = false
        for (let i = 0; i < ring.points.length; i += 2) {
          const x = cx + ring.points[i]! * scale
          const y = cy + ring.points[i + 1]! * scale
          if (offScreen(x, y)) {
            drawing = false
            continue
          }
          if (drawing) ctx.lineTo(x, y)
          else (ctx.moveTo(x, y), (drawing = true))
        }
        if (close && drawing) ctx.closePath()
        ctx.stroke()
      }

      /** Closed ring drawn with both a fill and a stroke; skipped when off screen. */
      const traceFilled = (ring: ProjectedRing) => {
        if (boxOffScreen(ring)) return
        ctx.beginPath()
        for (let i = 0; i < ring.points.length; i += 2) {
          const x = cx + ring.points[i]! * scale
          const y = cy + ring.points[i + 1]! * scale
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }

      ctx.strokeStyle = '#38424f'
      ctx.lineWidth = 1
      ctx.setLineDash([])
      for (const ring of geography.states) trace(ring, false)

      ctx.fillStyle = '#5c6979'
      ctx.font = '10px ui-monospace, monospace'
      ctx.textAlign = 'center'
      for (const { code, point } of geography.labels) {
        const x = cx + point[0] * scale
        const y = cy + point[1] * scale
        if (!onScreen(x, y)) continue
        ctx.fillText(code, x, y)
      }

      for (const { area, ring } of visibleAirspace) {
        if (boxOffScreen(ring)) continue
        const style = airspaceStyles[area.kind]
        ctx.strokeStyle = style.stroke
        ctx.lineWidth = style.width
        ctx.setLineDash(style.dash)
        trace(ring, true)
      }
      ctx.setLineDash([])

      if (showTfrs) {
        // A translucent fill is unique to TFRs, so they read differently from
        // every other layer even before the label is legible.
        ctx.setLineDash([])
        ctx.lineWidth = tfrStyle.width
        ctx.strokeStyle = tfrStyle.stroke
        ctx.fillStyle = tfrStyle.fill
        for (const { ring } of tfrShapes) traceFilled(ring)
      }

      // Inner ring dashed, outer solid, so the two bounds differ by more than colour.
      const ring = (nm: number, dashed: boolean, label: string) => {
        ctx.beginPath()
        ctx.setLineDash(dashed ? [4, 4] : [])
        ctx.strokeStyle = '#e8eef5'
        ctx.lineWidth = 1.1
        ctx.arc(cx, cy, nm * scale, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#e8eef5'
        ctx.font = '11px ui-monospace, monospace'
        ctx.textAlign = 'center'
        // Labelled on the upper-left diagonal so the inner ring clears the origin.
        ctx.fillText(label, cx - nm * scale * 0.707, cy - nm * scale * 0.707 - 5)
      }
      // A zero minimum has no ring to draw, and its label would land on the origin.
      if (band.minNm > 0) ring(band.minNm, true, `${band.minNm} nm`)
      ring(band.maxNm, false, `${band.maxNm} nm`)

      // One pass over every field. In-range ones are bright and larger; the rest
      // are dim. A dark ring around each keeps an airport readable where it sits
      // on top of an airspace boundary.
      placed.current = plotted.map((entry) => ({
        entry,
        x: cx + entry.dx * scale,
        y: cy + entry.dy * scale,
      }))

      const isActive = (id: string) => id === picked?.airport.id || id === hover?.airport.id
      /** Where a burger was drawn, so an identifier is not printed over it. */
      const foodMarks: Array<{ x: number; y: number }> = []

      for (const { entry, x, y } of placed.current) {
        if (offScreen(x, y)) continue
        const active = isActive(entry.airport.id)
        const radius = active ? 5 : entry.inRange ? 3 : 2
        const colour = active ? '#f2b134' : entry.inRange ? '#eef3f9' : '#7a8798'
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fillStyle = colour
        ctx.fill()
        ctx.lineWidth = active ? 2 : 1.5
        ctx.strokeStyle = '#0b0f14'
        ctx.stroke()

        // The dot still marks the position; the burger sits above it and takes
        // the dot's own colour, so range stays a matter of brightness and food
        // stays a matter of shape.
        if (entry.airport.fieldFood) {
          const my = y - radius - 2 - (FOOD_MARK_PX * 0.9) / 2
          foodMarkPath(ctx, x, my, FOOD_MARK_PX)
          ctx.lineWidth = 2.5
          ctx.lineJoin = 'round'
          ctx.strokeStyle = '#0b0f14'
          ctx.stroke()
          ctx.fillStyle = colour
          ctx.fill()
          foodMarks.push({ x, y: my })
        }
      }

      ctx.beginPath()
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2)
      ctx.fillStyle = '#e8eef5'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#0b0f14'
      ctx.stroke()

      // ---------------------------------------------------------------- labels
      //
      // One reservation list for every label on the plot. Airports claim their
      // space first, because they are what the map is for; airspace annotations
      // take what is left over. A Class D is centred on its airport, so without
      // this its "D 26/SFC" printed straight over the field it belongs to.

      const reserved: Array<{ x: number; y: number; halfWidth: number; halfHeight: number }> = []
      for (const mark of foodMarks) {
        reserved.push({ x: mark.x, y: mark.y, halfWidth: FOOD_MARK_PX / 2, halfHeight: FOOD_MARK_PX * 0.45 })
      }

      /** Boxes are centre-anchored, with a little air around each. */
      const fits = (x: number, y: number, halfWidth: number, halfHeight: number) =>
        onScreen(x, y) &&
        !reserved.some(
          (box) =>
            Math.abs(x - box.x) < halfWidth + box.halfWidth + 3 &&
            Math.abs(y - box.y) < halfHeight + box.halfHeight + 2,
        )

      const reserve = (x: number, y: number, halfWidth: number, halfHeight: number) =>
        reserved.push({ x, y, halfWidth, halfHeight })

      ctx.lineJoin = 'round'
      ctx.lineWidth = 3.5
      ctx.strokeStyle = 'rgba(11, 15, 20, 0.92)'

      // The origin is never dropped.
      ctx.font = '11px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.strokeText(origin.id, cx, cy + 18)
      ctx.fillStyle = '#e8eef5'
      ctx.fillText(origin.id, cx, cy + 18)
      reserve(cx, cy + 14, ctx.measureText(origin.id).width / 2, 9)
      reserve(cx, cy, 6, 6)

      /** An identifier set beside its dot. False when there was no room for it. */
      const labelAirport = (id: string, x: number, y: number, colour: string, size: number) => {
        ctx.font = `${size}px ui-monospace, monospace`
        const width = ctx.measureText(id).width
        const lx = x + 6 + width / 2
        const ly = y + 1
        if (!fits(lx, ly, width / 2, size / 2 + 1)) return false
        reserve(lx, ly, width / 2, size / 2 + 1)
        reserve(x, y, 4, 4)
        ctx.textAlign = 'center'
        ctx.strokeText(id, lx, ly)
        ctx.fillStyle = colour
        ctx.fillText(id, lx, ly)
        return true
      }

      // Whatever is selected wins its spot, then the fields in range, then the
      // rest, so the budget is always spent on the useful ones first.
      const budget = labelBudget(box.width, box.height, zoom)
      const byPriority = [...placed.current].sort(
        (a, b) =>
          Number(isActive(b.entry.airport.id)) - Number(isActive(a.entry.airport.id)) ||
          Number(b.entry.inRange) - Number(a.entry.inRange),
      )
      let airportLabels = 0
      for (const { entry, x, y } of byPriority) {
        const active = isActive(entry.airport.id)
        // Actives sort to the front, so they are named before the budget binds
        // and stay named however far out the plot is zoomed.
        if (!active && airportLabels >= budget.airports) continue
        const printed = labelAirport(
          entry.airport.id,
          x,
          y,
          active ? '#f2b134' : entry.inRange ? '#dbe3ec' : '#8b98aa',
          entry.inRange ? 10 : 9,
        )
        if (printed && !active) airportLabels++
      }

      ctx.textAlign = 'center'
      ctx.font = '10px ui-monospace, monospace'
      for (const { tfr, ring } of showTfrs ? tfrShapes : []) {
        if ((ring.maxX - ring.minX) * scale < LABEL_MIN_PX) continue
        const text = `TFR ${tfr.notamId}`
        const x = cx + ((ring.minX + ring.maxX) / 2) * scale
        const y = cy + ((ring.minY + ring.maxY) / 2) * scale
        const halfWidth = ctx.measureText(text).width / 2
        if (!fits(x, y, halfWidth, 6)) continue
        reserve(x, y, halfWidth, 6)
        ctx.strokeText(text, x, y)
        ctx.fillStyle = tfrStyle.stroke
        ctx.fillText(text, x, y)
      }

      // Biggest area first, so a wide MOA is named before a shelf tucked inside
      // it. The centre is tried first; where an airport already holds it, the
      // annotation moves to the top of the shape the way a sectional prints it.
      const bySize = [...visibleAirspace].sort(
        (a, b) => b.ring.maxX - b.ring.minX - (a.ring.maxX - a.ring.minX),
      )
      let airspaceLabels = 0
      for (const { area, ring } of bySize) {
        if (airspaceLabels >= budget.airspace) break
        const widthPx = (ring.maxX - ring.minX) * scale
        if (widthPx < LABEL_MIN_PX) continue

        const text = areaLabel(area)
        const altitudes = widthPx > ALTITUDE_MIN_PX ? altitudeLabel(area) : null
        const x = cx + ((ring.minX + ring.maxX) / 2) * scale
        const midY = cy + ((ring.minY + ring.maxY) / 2) * scale
        const topY = cy + ring.minY * scale + AIRSPACE_LABEL_INSET_PX
        const bottomY = cy + ring.maxY * scale - AIRSPACE_LABEL_INSET_PX

        ctx.font = '10px ui-monospace, monospace'
        const halfWidth = Math.max(
          ctx.measureText(text).width,
          altitudes ? ctx.measureText(altitudes).width : 0,
        ) / 2
        const halfHeight = altitudes ? 11 : 6

        const y = [midY, topY, bottomY].find((candidate) =>
          fits(x, candidate, halfWidth, halfHeight),
        )
        if (y === undefined) continue
        reserve(x, y, halfWidth, halfHeight)
        airspaceLabels++

        ctx.fillStyle = airspaceStyles[area.kind].stroke
        ctx.strokeText(text, x, y)
        ctx.fillText(text, x, y)
        if (altitudes) {
          ctx.font = '9px ui-monospace, monospace'
          ctx.strokeText(altitudes, x, y + 11)
          ctx.fillText(altitudes, x, y + 11)
        }
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [
    plotted,
    band,
    origin,
    picked,
    hover,
    geography,
    visibleAirspace,
    showTfrs,
    tfrShapes,
    frame,
    zoom,
  ])

  // A non-passive listener, so the page does not scroll while zooming the plot.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setZoom((current) =>
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * (event.deltaY < 0 ? 1.12 : 1 / 1.12))),
      )
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  if (!origin || legs.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted">
        Pick a departure airport and a time band to plot candidates.
      </p>
    )
  }

  /** Ends a press however it finished, always giving the pointer back. */
  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = drag.current
    drag.current = null
    setGrabbing(false)
    if (active?.captured && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    return active
  }

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return { px: event.clientX - box.left, py: event.clientY - box.top }
  }

  const nearestAirport = (px: number, py: number) => {
    let best: { entry: PlottedAirport; d: number } | null = null
    for (const { entry, x, y } of placed.current) {
      const d = Math.hypot(x - px, y - py)
      if (d < 12 && (!best || d < best.d)) best = { entry, d }
    }
    return best?.entry ?? null
  }

  /** Everything drawn under a point, smallest area first so detail wins. */
  const hitsAt = (px: number, py: number): Array<Hit> => {
    const view = frame()
    if (!view) return []
    const x = (px - view.cx) / view.scale
    const y = (py - view.cy) / view.scale

    const airspace = visibleAirspace
      .filter(({ ring }) => inRing(ring, x, y))
      .sort((a, b) => a.ring.maxX - a.ring.minX - (b.ring.maxX - b.ring.minX))
      .map(({ area }): Hit => ({ sort: 'airspace', area }))

    const seen = new Set<string>()
    const tfrHits = showTfrs
      ? tfrShapes
          .filter(({ tfr, ring }) => {
            if (!inRing(ring, x, y) || seen.has(tfr.notamId)) return false
            seen.add(tfr.notamId)
            return true
          })
          .map(({ tfr, part }): Hit => ({ sort: 'tfr', tfr, part }))
      : []

    return [...tfrHits, ...airspace]
  }

  const present = new Set(layers.airspace.map((area) => area.kind))

  return (
    <div className="mt-6">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className={`h-[min(70vh,560px)] w-full touch-none rounded border border-line bg-ink-800 ${grabbing ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, from: pan, moved: 0, captured: false }
          }}
          onPointerMove={(e) => {
            const active = drag.current
            if (!active) {
              const { px, py } = canvasPoint(e)
              setHover(nearestAirport(px, py))
              return
            }
            const dx = e.clientX - active.x
            const dy = e.clientY - active.y
            active.moved = Math.max(active.moved, Math.hypot(dx, dy))
            if (active.moved <= DRAG_THRESHOLD_PX) return
            // Capture only once the press has become a drag, so a plain click
            // never leaves the canvas holding the pointer.
            if (!active.captured) {
              e.currentTarget.setPointerCapture(e.pointerId)
              active.captured = true
              setGrabbing(true)
            }
            setPan({ x: active.from.x + dx, y: active.from.y + dy })
          }}
          onPointerUp={(e) => {
            const active = endDrag(e)
            // A drag moved the map; only a press that stayed put is a click.
            if (!active || active.moved > DRAG_THRESHOLD_PX) return

            // One popup for every kind of click. A field used to set `?pick=`
            // outright and report itself in a line under the map, which put the
            // answer a long way from the thing that was clicked and left no room
            // for what is on the field.
            const { px, py } = canvasPoint(e)
            const entry = nearestAirport(px, py)
            const hits = hitsAt(px, py)
            const all: Array<Hit> = entry ? [{ sort: 'airport', entry }, ...hits] : hits
            setPopup(all.length > 0 ? { x: px, y: py, hits: all } : null)
          }}
          onPointerCancel={endDrag}
          onPointerLeave={(e) => {
            endDrag(e)
            setHover(null)
          }}
        />

        <ZoomControls
          zoom={zoom}
          onZoom={setZoom}
          onReset={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
        />

        {popup && (
          <MapPopup
            popup={popup}
            onClose={() => setPopup(null)}
            onPick={(id) => {
              setPopup(null)
              navigate({ search: (prev) => ({ ...prev, pick: id }), replace: true })
            }}
            onWiden={(minutes) => {
              const hours = minutes / 60
              setPopup(null)
              navigate({
                search: (prev) => ({
                  ...prev,
                  // Widen whichever end is in the way, rounded out to the step.
                  min: Math.min(prev.min, Math.floor(hours * 4) / 4),
                  max: Math.max(prev.max, Math.ceil(hours * 4) / 4),
                }),
                replace: true,
              })
            }}
          />
        )}
      </div>

      <p className="mt-3 font-mono text-xs text-muted">
        {hover || picked ? (
          <Readout entry={(hover ?? picked)!} origin={origin} />
        ) : (
          <>
            Bright dots are in range, dim ones are not. A{' '}
            <FoodMark className="inline-block align-[-0.1em] text-text" /> means there is somewhere
            to eat on the field. Click any of them, or anywhere else to identify the airspace. Drag
            to move, scroll to zoom.
          </>
        )}
      </p>
      <AirspaceLegend
        present={present}
        hidden={hidden}
        onToggleKind={(kind) =>
          setHidden((current) => {
            const next = new Set(current)
            if (next.has(kind)) next.delete(kind)
            else next.add(kind)
            return next
          })
        }
        onShowAll={() => setHidden(new Set())}
        tfrs={tfrs}
        showTfrs={showTfrs}
        onToggleTfrs={() => setShowTfrs((on) => !on)}
      />
      <TfrList report={tfrs} />
    </div>
  )
}

function ZoomControls({
  zoom,
  onZoom,
  onReset,
}: {
  zoom: number
  /** Takes an updater so repeated presses compound instead of racing. */
  onZoom: (next: (current: number) => number) => void
  onReset: () => void
}) {
  const step = (factor: number) => () =>
    onZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor)))
  const button = 'size-7 rounded border border-line bg-ink-900/90 font-mono text-sm text-text'

  return (
    <div className="absolute right-3 top-3 flex flex-col items-center gap-1">
      <button type="button" aria-label="Zoom in" className={button} onClick={step(ZOOM_STEP)}>
        +
      </button>
      <button type="button" aria-label="Zoom out" className={button} onClick={step(1 / ZOOM_STEP)}>
        −
      </button>
      <button
        type="button"
        className="rounded border border-line bg-ink-900/90 px-1.5 py-0.5 font-mono text-[10px] text-muted"
        onClick={onReset}
      >
        {zoom.toFixed(1)}x
      </button>
    </div>
  )
}

/**
 * Names whatever was clicked: the field, what is on it, and every airspace and
 * TFR layer underneath, smallest first. This is the only answer the map gives to
 * a click, which is why the field's own actions live in it rather than under the
 * plot.
 */
function MapPopup({
  popup,
  onClose,
  onPick,
  onWiden,
}: {
  popup: Popup
  onClose: () => void
  /** Takes the field as the destination for this spin. */
  onPick: (id: string) => void
  /** Stretches the time band far enough to take in a field it currently excludes. */
  onWiden: (minutes: number) => void
}) {
  return (
    <div
      className="absolute z-10 flex max-h-[min(24rem,88%)] w-72 flex-col overflow-y-auto rounded border border-line bg-ink-900/97 p-3 shadow-xl"
      style={{
        left: `min(${popup.x + 12}px, calc(100% - 19rem))`,
        top: `min(${popup.y + 12}px, calc(100% - 9rem))`,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="float-right -mt-1 font-mono text-sm text-muted hover:text-text"
      >
        ×
      </button>
      <ul className="space-y-2.5">
        {popup.hits.slice(0, 5).map((hit) =>
          hit.sort === 'airport' ? (
            <li key={`airport-${hit.entry.airport.id}`}>
              <AirportHit hit={hit.entry} onPick={onPick} onWiden={onWiden} />
            </li>
          ) : hit.sort === 'tfr' ? (
            <li key={`tfr-${hit.tfr.notamId}`}>
              <p className="font-mono text-xs" style={{ color: tfrStyle.stroke }}>
                TFR {hit.tfr.notamId} · {hit.tfr.type}
              </p>
              <p className="mt-0.5 text-xs text-text">{hit.tfr.description}</p>
              <p className="font-mono text-xs text-muted">{altitudeSentence(hit.part)}</p>
            </li>
          ) : (
            <li key={`${hit.area.kind}-${hit.area.label}-${hit.area.points[0]}`}>
              <p
                className="font-mono text-xs"
                style={{ color: airspaceStyles[hit.area.kind].stroke }}
              >
                {airspaceStyles[hit.area.kind].name}
              </p>
              <p className="mt-0.5 text-xs text-text">{hit.area.label}</p>
              <p className="font-mono text-xs text-muted">{altitudeSentence(hit.area)}</p>
            </li>
          ),
        )}
      </ul>
      {popup.hits.length > 5 && (
        <p className="mt-2 font-mono text-xs text-muted">
          and {popup.hits.length - 5} more layers here
        </p>
      )}
    </div>
  )
}

function AirportHit({
  hit,
  onPick,
  onWiden,
}: {
  hit: PlottedAirport
  onPick: (id: string) => void
  onWiden: (minutes: number) => void
}) {
  const { airport } = hit
  const runway =
    airport.rwy === null ? 'runway unknown'
    : `${airport.rwy.toLocaleString()} ft ${airport.paved ? 'hard' : 'turf'}`

  return (
    <>
      <p className={`font-mono text-xs ${hit.inRange ? 'text-amber' : 'text-muted'}`}>
        {airport.id} · {hit.distanceNm} nm · {formatMinutes(hit.minutes)} each way
      </p>
      <p className="mt-0.5 text-xs text-text">{airport.name}</p>
      <p className="font-mono text-xs text-muted">
        {String(hit.courseDeg).padStart(3, '0')}° {compassPoint(hit.courseDeg)} · {runway}
        {airport.iap && ' · approach'}
      </p>
      <p className="mt-1 flex gap-3 font-mono text-xs">
        {hit.inRange ?
          <button
            type="button"
            onClick={() => onPick(airport.id)}
            className="text-sky underline underline-offset-4"
          >
            pick this
          </button>
        : <button
            type="button"
            onClick={() => onWiden(hit.minutes)}
            className="text-sky underline underline-offset-4"
          >
            add to the time band
          </button>
        }
        <Link
          to="/airport/$id"
          params={{ id: airport.id }}
          className="text-sky underline underline-offset-4"
        >
          field detail
        </Link>
      </p>
      <FoodList airport={airport} />
    </>
  )
}

/**
 * What is on the field, as far as the map needs to say it. Hours and the last
 * sighting are printed where a source has them, since a cafe that shut is the
 * whole trip wasted; everything else about a place lives on the field page.
 *
 * At a field the airlines serve nothing is named at all. Neither source can say
 * which side of security a place there is on, which is why such a field is not a
 * destination, and listing its restaurants would say the opposite of the mark on
 * the map and the filter in the header.
 */
function FoodList({ airport }: { airport: MapAirport }) {
  const { food, foodCount, terminalFood, airlineField } = airport
  if (foodCount === 0 && terminalFood === 0) return null

  if (airlineField) {
    return (
      <p className="mt-2 font-mono text-[10px] text-muted">
        The airlines serve this field, so its {foodCount + terminalFood} places to eat are
        probably past security. Not a destination.
      </p>
    )
  }

  return (
    <>
      <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted">
        <FoodMark className="text-text" /> Food on field
      </p>
      <ul className="mt-0.5 space-y-1">
        {food.map((place) => {
          // Hours and the last sighting share a line: both are the answer to
          // "will it be open when I get there", and neither earns its own.
          const footnote = [place.hours, formatSeen(place.seen)].filter(Boolean).join(' · ')
          return (
            <li key={place.name} className="text-xs text-text">
              {place.name}{' '}
              <span className="font-mono text-[10px] text-muted">
                {formatRestaurantKind(place.kind)}
                {place.chain && ', chain'}
              </span>
              {footnote && <span className="block font-mono text-[10px] text-muted">{footnote}</span>}
            </li>
          )
        })}
        {foodCount > food.length && (
          <li className="font-mono text-[10px] text-muted">
            and {foodCount - food.length} more on the field
          </li>
        )}
        {terminalFood > 0 && (
          <li className="font-mono text-[10px] text-muted">
            {terminalFood} more inside the terminal, past security
          </li>
        )}
      </ul>
    </>
  )
}

/** Class letter for controlled airspace, published name for special use. */
function areaLabel(area: AirspaceArea): string {
  if (area.kind === 'B' || area.kind === 'C' || area.kind === 'D') return area.kind
  return area.label.length > 20 ? `${area.label.slice(0, 19)}…` : area.label
}

function AirspaceLegend({
  present,
  hidden,
  onToggleKind,
  onShowAll,
  tfrs,
  showTfrs,
  onToggleTfrs,
}: {
  present: ReadonlySet<AirspaceKind>
  hidden: ReadonlySet<AirspaceKind>
  onToggleKind: (kind: AirspaceKind) => void
  onShowAll: () => void
  tfrs: TfrReport | null
  showTfrs: boolean
  onToggleTfrs: () => void
}) {
  const kinds = legendOrder.filter((kind) => present.has(kind))

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
      {kinds.length === 0 && (
        <span className="font-mono text-xs text-muted">No airspace in range</span>
      )}
      {kinds.map((kind) => {
        const style = airspaceStyles[kind]
        const off = hidden.has(kind)
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={!off}
            onClick={() => onToggleKind(kind)}
            className={`flex items-center gap-1.5 font-mono text-xs ${off ? 'text-muted/50 line-through' : 'text-muted hover:text-text'}`}
          >
            <svg width="26" height="8" aria-hidden>
              <line
                x1="0"
                y1="4"
                x2="26"
                y2="4"
                stroke={off ? '#404a58' : style.stroke}
                strokeWidth={style.width}
                strokeDasharray={style.dash.join(' ') || undefined}
              />
            </svg>
            {style.name}
          </button>
        )
      })}

      <button
        type="button"
        aria-pressed={showTfrs}
        onClick={onToggleTfrs}
        className={`flex items-center gap-1.5 font-mono text-xs ${showTfrs ? 'text-muted hover:text-text' : 'text-muted/50 line-through'}`}
      >
        <svg width="26" height="8" aria-hidden>
          <rect
            x="0"
            y="1"
            width="26"
            height="6"
            fill={showTfrs ? tfrStyle.fill : 'transparent'}
            stroke={showTfrs ? tfrStyle.stroke : '#404a58'}
          />
        </svg>
        TFR{tfrs && tfrs.tfrs.length > 0 ? ` (${tfrs.tfrs.length})` : ''}
      </button>

      {hidden.size > 0 && (
        <button type="button" onClick={onShowAll} className="font-mono text-xs text-sky underline underline-offset-4">
          show all
        </button>
      )}

      <span className="ml-auto font-mono text-xs text-muted">Lateral limits only.</span>
    </div>
  )
}

/**
 * The authoritative half of the TFR layer. Every restriction the FAA lists for
 * the states in range appears here, including any the map could not draw.
 */
function TfrList({ report }: { report: TfrReport | null }) {
  if (!report) {
    return <p className="mt-3 font-mono text-xs text-muted">Checking TFRs</p>
  }

  if (report.unavailable) {
    return (
      <p className="mt-3 font-mono text-xs text-amber">
        The FAA TFR feed could not be reached. Assume nothing about restrictions here and check
        NOTAMs.
      </p>
    )
  }

  if (report.tfrs.length === 0) {
    return <p className="mt-3 font-mono text-xs text-muted">No active TFRs reach this plot.</p>
  }

  return (
    <div className="mt-4">
      <p className="font-mono text-xs text-muted">
        {report.tfrs.length} active {report.tfrs.length === 1 ? 'TFR' : 'TFRs'} in range
        {report.undrawn > 0 && (
          <span className="text-amber">
            {' '}
            · {report.undrawn} with no readable shape, listed here but not drawn and not range
            checked
          </span>
        )}
      </p>
      <ul className="mt-1 max-h-44 overflow-y-auto border-t border-line">
        {report.tfrs.map((tfr) => (
          <li
            key={tfr.notamId}
            className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-line/60 py-1.5 font-mono text-xs sm:flex-nowrap sm:py-1"
          >
            <span className="w-14 shrink-0" style={{ color: tfrStyle.stroke }}>
              {tfr.notamId}
            </span>
            <span className="w-6 shrink-0 text-muted">{tfr.state}</span>
            <span className="w-28 shrink-0 truncate text-muted">{tfr.type}</span>
            {/* On a phone the description would truncate to a few characters, so it
                takes its own line and the warning stays up with the identifier. */}
            {tfr.parts.length === 0 && (
              <span className="ml-auto shrink-0 text-amber sm:order-last">not drawn</span>
            )}
            <span className="w-full truncate text-text sm:w-auto">{tfr.description}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Readout({ entry, origin }: { entry: PlottedAirport; origin: Airport }) {
  return (
    <span className="text-text">
      {origin.id} to <span className={entry.inRange ? 'text-amber' : 'text-muted'}>
        {entry.airport.id}
      </span>{' '}
      {entry.airport.name} · {entry.distanceNm} nm ·{' '}
      {String(entry.courseDeg).padStart(3, '0')}° {compassPoint(entry.courseDeg)} ·{' '}
      {formatMinutes(entry.minutes)} each way
      {entry.inRange ? '' : ' · outside the time band'}
    </span>
  )
}
