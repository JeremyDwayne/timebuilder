import type { Metar, Runway } from '~/lib/airport'
import { compassPoint } from '~/lib/geo'
import { bearingDelta, favouredRunway, type WindSolution } from '~/lib/wind'

/**
 * Plan view of the runway environment with true north up. When the observation
 * carries a usable wind, the favoured runway is highlighted and a windsock is
 * drawn on the rim at the bearing the wind is coming from.
 */

const RIM = 84
const MIN_HALF = 30
const MAX_HALF = 62
/** The sock is mounted outside the rim so it never sits on a runway label. */
const SOCK_MOUTH = 108
const SOCK_LENGTH = 20

type Props = {
  runways: ReadonlyArray<Runway>
  /** Null while the observation is still streaming in, or when there is none. */
  report: Metar | null
  /** The observation has not arrived yet, as opposed to there being none. */
  pending?: boolean
}

/** Cartesian offset for a compass bearing, with north up and east right. */
function at(bearingDeg: number, radius: number) {
  const a = ((bearingDeg - 90) * Math.PI) / 180
  return { x: radius * Math.cos(a), y: radius * Math.sin(a) }
}

const PARALLEL_SPACING = 18
/** Side-by-side runways are within this many degrees of each other. */
const PARALLEL_TOLERANCE = 5

type PlacedRunway = {
  runway: Runway
  /** Half the drawn length, so the ends sit at +/- this from the centre. */
  half: number
  /** Lateral shift that separates parallel runways from each other. */
  shift: { x: number; y: number }
}

const SUFFIX_ORDER = ['L', 'C', 'R']

/**
 * Lays runways out around the origin, spreading parallel sets sideways so a
 * field like 17L/17R does not draw as a single stripe. Left, centre and right
 * are placed as the pilot would see them on the approach.
 */
function layout(runways: ReadonlyArray<Runway>, longestFt: number): Array<PlacedRunway> {
  const groups: Array<{ axis: number; members: Array<Runway> }> = []
  for (const runway of runways) {
    const axis = runway.ends[0].headingTrue % 180
    const group = groups.find(
      (g) => Math.abs(g.axis - axis) <= PARALLEL_TOLERANCE || Math.abs(g.axis - axis) >= 180 - PARALLEL_TOLERANCE,
    )
    if (group) group.members.push(runway)
    else groups.push({ axis, members: [runway] })
  }

  const placed: Array<PlacedRunway> = []
  for (const group of groups) {
    const members = [...group.members].sort((a, b) => {
      const rank = (r: Runway) => {
        const suffix = r.ends[0].ident.slice(-1)
        const index = SUFFIX_ORDER.indexOf(suffix)
        return index < 0 ? SUFFIX_ORDER.length : index
      }
      return rank(a) - rank(b) || (b.lengthFt ?? 0) - (a.lengthFt ?? 0)
    })
    members.forEach((runway, index) => {
      const heading = runway.ends[0].headingTrue
      // Left of the landing direction, so the first-sorted runway reads as "L".
      const distance = ((members.length - 1) / 2 - index) * PARALLEL_SPACING
      const shift = at(heading - 90, distance)
      placed.push({
        runway,
        half: MIN_HALF + (MAX_HALF - MIN_HALF) * Math.min(1, (runway.lengthFt ?? 0) / longestFt),
        shift,
      })
    })
  }
  return placed
}

export function RunwayDiagram({ runways, report, pending }: Props) {
  if (runways.length === 0) return null

  const favoured = favouredRunway(runways, report)
  const longest = Math.max(...runways.map((r) => r.lengthFt ?? 0), 1)
  const approximate = runways.some((r) => r.approximateHeading)
  const windBearing = favoured && typeof report?.windDir === 'number' ? report.windDir : null
  const placement = layout(runways, longest)

  return (
    <div className="flex flex-wrap items-start gap-8">
      <svg
        viewBox="-120 -120 240 240"
        className="w-[min(80vw,300px)] shrink-0"
        role="img"
        aria-label={
          favoured
            ? `Runway diagram, wind favours runway ${favoured.end.ident}`
            : 'Runway diagram'
        }
      >
        <circle r={RIM} fill="none" stroke="var(--color-line)" strokeWidth={0.8} strokeDasharray="3 4" />
        {(['N', 'E', 'S', 'W'] as const).map((label, index) => {
          const { x, y } = at(index * 90, RIM + 13)
          // Drop a cardinal the sock would sit on top of.
          if (windBearing != null && Math.abs(bearingDelta(index * 90, windBearing)) < 18) {
            return null
          }
          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="font-mono"
              fontSize="9"
              fill="var(--color-muted)"
            >
              {label}
            </text>
          )
        })}

        {placement.map(({ runway, half, shift }) => {
          const [le, he] = runway.ends
          const start = at(le.headingTrue + 180, half)
          const end = at(le.headingTrue, half)
          const isFavoured = favoured?.runway.designator === runway.designator
          return (
            <g key={runway.designator} transform={`translate(${shift.x} ${shift.y})`}>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={isFavoured ? 'var(--color-amber)' : '#4a5563'}
                strokeWidth={9}
                strokeLinecap="butt"
              />
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="var(--color-ink-900)"
                strokeWidth={0.8}
                strokeDasharray="5 5"
              />
              {isFavoured && favoured && (
                <LandingArrow heading={favoured.end.headingTrue} half={half} />
              )}
              {[le, he].map((endpoint) => {
                const label = at(endpoint.headingTrue + 180, half + 12)
                const active = isFavoured && favoured?.end.ident === endpoint.ident
                return (
                  <text
                    key={endpoint.ident}
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="font-mono"
                    fontSize="9"
                    fontWeight={active ? 700 : 400}
                    fill={active ? 'var(--color-amber)' : 'var(--color-muted)'}
                  >
                    {endpoint.ident}
                  </text>
                )
              })}
            </g>
          )
        })}

        {windBearing != null && <Windsock bearing={windBearing} />}
      </svg>

      <div className="min-w-56">
        <WindReadout favoured={favoured} report={report} pending={pending} />

        <table className="mt-5 w-full font-mono text-xs">
          <tbody>
            {runways.map((runway) => (
              <tr key={runway.designator} className="border-b border-line/60">
                <td className="py-1 pr-4 text-text">{runway.designator}</td>
                <td className="py-1 pr-4 text-right tabular-nums text-muted">
                  {runway.lengthFt ? `${runway.lengthFt.toLocaleString()} ft` : '--'}
                  {runway.widthFt ? ` x ${runway.widthFt}` : ''}
                </td>
                <td className="py-1 text-right text-muted">
                  {runway.paved ? 'hard' : 'turf'}
                  {runway.lit ? ', lit' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {approximate && (
          <p className="mt-3 font-mono text-xs text-muted">
            Some bearings are taken from the runway number, so they carry the local magnetic
            variation as error.
          </p>
        )}
      </div>
    </div>
  )
}

/** Chevron at the favoured threshold, pointing the way you would land. */
function LandingArrow({ heading, half }: { heading: number; half: number }) {
  const base = at(heading + 180, half - 3)
  const tip = at(heading + 180, half - 13)
  const dx = (tip.x - base.x) / 10
  const dy = (tip.y - base.y) / 10
  return (
    <polygon
      points={[
        `${tip.x},${tip.y}`,
        `${base.x - dy * 4},${base.y + dx * 4}`,
        `${base.x + dy * 4},${base.y - dx * 4}`,
      ].join(' ')}
      fill="var(--color-ink-900)"
    />
  )
}

/** Sock mounted just outside the rim at the bearing the wind is from, streaming inward. */
function Windsock({ bearing }: { bearing: number }) {
  const pole = at(bearing, SOCK_MOUTH)
  const tip = at(bearing, SOCK_MOUTH - SOCK_LENGTH)
  const dx = (tip.x - pole.x) / SOCK_LENGTH
  const dy = (tip.y - pole.y) / SOCK_LENGTH
  // Perpendicular to the sock axis, used to fan the mouth open.
  const px = -dy
  const py = dx
  const mouth = 6
  const throat = 2.4
  const band = (from: number, to: number) => {
    const w0 = mouth + ((throat - mouth) * from) / SOCK_LENGTH
    const w1 = mouth + ((throat - mouth) * to) / SOCK_LENGTH
    const a = { x: pole.x + dx * from, y: pole.y + dy * from }
    const b = { x: pole.x + dx * to, y: pole.y + dy * to }
    return [
      `${a.x + px * w0},${a.y + py * w0}`,
      `${b.x + px * w1},${b.y + py * w1}`,
      `${b.x - px * w1},${b.y - py * w1}`,
      `${a.x - px * w0},${a.y - py * w0}`,
    ].join(' ')
  }
  return (
    <g>
      <circle cx={pole.x} cy={pole.y} r={2.4} fill="var(--color-text)" />
      {[0, 1, 2, 3].map((i) => (
        <polygon
          key={i}
          points={band((i * SOCK_LENGTH) / 4, ((i + 1) * SOCK_LENGTH) / 4)}
          fill={i % 2 === 0 ? 'var(--color-text)' : 'var(--color-ink-700)'}
          stroke="var(--color-text)"
          strokeWidth={0.6}
        />
      ))}
    </g>
  )
}

function WindReadout({
  favoured,
  report,
  pending,
}: {
  favoured: WindSolution | null
  report: Metar | null
  pending?: boolean
}) {
  if (!report) {
    return (
      <p className="font-mono text-xs text-muted">
        {pending ? 'Waiting on the wind' : 'No wind report, so any runway works.'}
      </p>
    )
  }

  if (!favoured) {
    const calm = report.windDir === 'VRB' ? 'Wind is variable' : 'Wind is calm or not reported'
    return <p className="font-mono text-xs text-muted">{calm}, so any runway works.</p>
  }

  const { end, headwindKt, crosswindKt, crosswindFrom, angleOffDeg } = favoured
  return (
    <div className="font-mono text-sm">
      <p className="text-xs text-muted">Wind favours</p>
      <p className="mt-1 text-lg text-amber">
        Runway {end.ident}
        <span className="ml-2 text-xs text-muted">
          {String(end.headingTrue).padStart(3, '0')}°T
        </span>
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted">Headwind</dt>
        <dd className="tabular-nums">{headwindKt.toFixed(0)} kt</dd>
        <dt className="text-muted">Crosswind</dt>
        <dd className="tabular-nums">
          {crosswindKt.toFixed(0)} kt from the {crosswindFrom}
        </dd>
        <dt className="text-muted">Wind</dt>
        <dd className="tabular-nums">
          {typeof report.windDir === 'number'
            ? `${String(report.windDir).padStart(3, '0')}°T ${compassPoint(report.windDir)}`
            : 'variable'}
          {report.windKt == null ? '' : ` at ${report.windKt} kt`}, {angleOffDeg}° off
        </dd>
      </dl>
    </div>
  )
}
