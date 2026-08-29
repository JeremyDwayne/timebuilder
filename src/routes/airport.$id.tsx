import { Await, Link, createFileRoute } from '@tanstack/react-router'

import { FrequencyTable } from '~/components/FrequencyTable'
import { RunwayDiagram } from '~/components/RunwayDiagram'
import type { FlightRules, Metar, Relative } from '~/lib/airport'
import { compassPoint } from '~/lib/geo'
import { getAirport, getMetar } from '~/server/airports.functions'

/**
 * Server-rendered, but the METAR is an outbound network call that would hold the
 * whole document hostage. The loader returns that promise unawaited, so Start
 * flushes the field data immediately and streams the observation in behind it.
 */
export const Route = createFileRoute('/airport/$id')({
  ssr: true,
  loader: async ({ params }) => {
    const detail = await getAirport({ data: { id: params.id } })
    return { ...detail, metar: getMetar({ data: { id: params.id } }) }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.airport.id} ${loaderData.airport.name} · Time Builder` },
          {
            name: 'description',
            content: `${loaderData.airport.name} in ${loaderData.airport.city}, ${loaderData.airport.state}.`,
          },
        ]
      : [],
  }),
  component: AirportPage,
})

function AirportPage() {
  const { airport, runways, frequencies, nearby, metar } = Route.useLoaderData()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="font-mono text-xs text-muted">
        {airport.icao ?? airport.id} · {airport.state}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {airport.name}
        <span className="ml-2 font-mono text-lg text-amber">{airport.id}</span>
      </h1>
      <p className="text-sm text-muted">
        {airport.city}, {airport.state}
      </p>

      <dl className="mt-6 grid max-w-xl grid-cols-2 gap-x-8 gap-y-3 font-mono text-sm sm:grid-cols-3">
        <Stat
          label="Longest runway"
          value={airport.rwy ? `${airport.rwy.toLocaleString()} ft` : 'unknown'}
        />
        <Stat label="Surface" value={airport.paved == null ? 'unknown' : airport.paved ? 'hard' : 'turf or gravel'} />
        <Stat label="Lighting" value={airport.lit == null ? 'unknown' : airport.lit ? 'lighted' : 'none'} />
        <Stat label="Field elevation" value={airport.elev == null ? 'unknown' : `${airport.elev.toLocaleString()} ft`} />
        <Stat label="Instrument approach" value={airport.iap ? 'published' : 'none'} />
        <Stat label="Position" value={`${airport.lat.toFixed(4)}, ${airport.lon.toFixed(4)}`} />
      </dl>

      <section className="mt-10">
        <h2 className="font-mono text-xs text-muted">Current observation</h2>
        <Await
          promise={metar}
          fallback={<p className="mt-2 text-sm text-muted">Fetching current observation</p>}
        >
          {(report) => <MetarPanel report={report} hasStation={airport.icao != null} />}
        </Await>
      </section>

      {runways.length > 0 && (
        <section className="mt-10">
          <h2 className="font-mono text-xs text-muted">Runway environment</h2>
          <div className="mt-3">
            {/*
              The layout renders straight away from the loader's field data; the
              streamed observation only adds the sock and the favoured runway.
            */}
            <Await promise={metar} fallback={<RunwayDiagram runways={runways} report={null} />}>
              {(report) => <RunwayDiagram runways={runways} report={report} />}
            </Await>
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-mono text-xs text-muted">Frequencies</h2>
        <FrequencyTable frequencies={frequencies} />
      </section>

      {nearby.length > 0 && (
        <section className="mt-10">
          <h2 className="font-mono text-xs text-muted">Public-use fields within 40 nm</h2>
          <ul className="mt-2 divide-y divide-line border-t border-line">
            {nearby.map((field) => (
              <NearbyRow key={field.id} field={field} />
            ))}
          </ul>
        </section>
      )}

      <Link to="/" search={{}} className="mt-10 inline-block text-sm text-sky underline underline-offset-4">
        Back to the wheel
      </Link>
    </div>
  )
}

/**
 * Category is spelled out and carries its own border treatment, so it never
 * depends on colour alone.
 */
const RULES_STYLE: Record<FlightRules, string> = {
  VFR: 'border-2 border-text text-text',
  MVFR: 'border-2 border-dashed border-amber text-amber',
  IFR: 'border-2 border-[#e07a3f] bg-[#e07a3f] text-ink-900',
  LIFR: 'border-2 border-double border-[#c94f4f] bg-[#c94f4f] text-ink-900',
}

function MetarPanel({ report, hasStation }: { report: Metar | null; hasStation: boolean }) {
  if (!report) {
    return (
      <p className="mt-2 text-sm text-muted">
        {hasStation ? 'No current report from this station.' : 'This field has no reporting station.'}
      </p>
    )
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-4 font-mono text-sm">
        {report.rules && (
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${RULES_STYLE[report.rules]}`}>
            {report.rules}
          </span>
        )}
        <span>
          Wind {report.windDir === 'VRB' ? 'VRB' : report.windDir == null ? '---' : `${String(report.windDir).padStart(3, '0')}°`}
          {report.windKt == null ? '' : ` at ${report.windKt} kt`}
        </span>
        <span>Vis {report.visibility ?? '--'} sm</span>
        <span>{report.tempC == null ? '' : `${report.tempC}°C`}</span>
        <span>{report.altimeterInHg == null ? '' : `${report.altimeterInHg.toFixed(2)} inHg`}</span>
      </div>
      <pre className="mt-3 overflow-x-auto rounded border border-line bg-ink-800 p-3 font-mono text-xs">
        {report.raw}
      </pre>
      {report.observedAt && (
        <p className="mt-1 font-mono text-xs text-muted">
          Reported {report.observedAt.slice(0, 10)} {report.observedAt.slice(11, 16)}Z
        </p>
      )}
    </div>
  )
}

function NearbyRow({ field }: { field: Relative }) {
  return (
    <li className="flex items-baseline gap-3 py-1.5 font-mono text-xs">
      <Link to="/airport/$id" params={{ id: field.id }} className="w-10 text-amber underline underline-offset-4">
        {field.id}
      </Link>
      <span className="truncate font-sans text-sm text-text">{field.name}</span>
      <span className="ml-auto shrink-0 tabular-nums text-muted">
        {field.distanceNm} nm {compassPoint(field.courseDeg)}
      </span>
    </li>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
