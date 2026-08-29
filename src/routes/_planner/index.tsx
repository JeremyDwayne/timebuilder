import { Link, createFileRoute, useLoaderData, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { Wheel } from '~/components/Wheel'
import { compassPoint } from '~/lib/geo'
import { formatMinutes, type Leg } from '~/lib/airport'
import { addEntry } from '~/lib/logbook'
import { getPickedLeg } from '~/server/airports.functions'

/**
 * Fully server-rendered: the candidate list and any shared `?pick=` land in the
 * initial HTML, so a link to a spin result reads correctly before hydration.
 *
 * The pick is resolved on its own rather than looked up in `legs`, because the
 * map can choose any in-range airport while `legs` is only an even sample of a
 * large match set.
 */
export const Route = createFileRoute('/_planner/')({
  ssr: true,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    deps.pick ? getPickedLeg({ data: { ...deps, pick: deps.pick } }) : null,
  component: SpinPage,
})

function SpinPage() {
  const search = Route.useSearch()
  const { origin, legs, truncated, matched } = useLoaderData({ from: '/_planner' })
  const picked = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })
  const [logged, setLogged] = useState<string | null>(null)

  if (!origin) {
    return (
      <p className="py-16 text-center text-sm text-muted">
        Enter the airport you are departing from to build a wheel.
      </p>
    )
  }

  if (legs.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted">
        Nothing matches inside that time band. Widen the hours, drop the runway minimum, or turn off
        a filter.
      </p>
    )
  }

  const seed = `${origin.id}:${search.min}:${search.max}:${search.speed}:${search.rwy}:${search.paved}:${search.iap}`

  return (
    <div className="mt-8 grid gap-10 md:grid-cols-[340px_1fr]">
      <Wheel
        legs={legs}
        seed={seed}
        pick={search.pick}
        onLand={(leg) =>
          navigate({ search: (prev) => ({ ...prev, pick: leg.id }), replace: true })
        }
      />

      <div>
        {picked ? (
          <Result
            leg={picked}
            from={origin.id}
            logged={logged === picked.id}
            onLog={() => {
              addEntry(picked, origin.id, new Date().toISOString())
              setLogged(picked.id)
            }}
          />
        ) : (
          <p className="text-sm text-muted">Spin the wheel to draw a destination.</p>
        )}

        <h2 className="mt-10 font-mono text-xs text-muted">
          {truncated ?
            `${legs.length} of ${matched} candidates, evenly spread, click any one to take it instead`
          : 'All candidates, click any one to take it instead'}
        </h2>
        <CandidateList
          legs={legs}
          picked={search.pick}
          onPick={(id) => navigate({ search: (prev) => ({ ...prev, pick: id }), replace: true })}
        />
      </div>
    </div>
  )
}

function Result({
  leg,
  from,
  logged,
  onLog,
}: {
  leg: Leg
  from: string
  logged: boolean
  onLog: () => void
}) {
  return (
    <section>
      <p className="font-mono text-xs text-muted">
        {from} to {leg.id}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {leg.name}
        <span className="ml-2 font-mono text-lg text-amber">{leg.id}</span>
      </h1>
      <p className="text-sm text-muted">
        {leg.city}, {leg.state}
      </p>

      <dl className="mt-5 grid max-w-lg grid-cols-2 gap-x-8 gap-y-2 font-mono text-sm sm:grid-cols-3">
        <Stat label="Distance" value={`${leg.distanceNm} nm`} />
        <Stat label="Each way" value={formatMinutes(leg.minutes)} />
        <Stat label="Round trip" value={formatMinutes(leg.minutes * 2)} />
        <Stat label="Course" value={`${String(leg.courseDeg).padStart(3, '0')}° ${compassPoint(leg.courseDeg)}`} />
        <Stat
          label="Runway"
          value={leg.rwy ? `${leg.rwy.toLocaleString()} ft ${leg.paved ? 'hard' : 'turf'}` : 'unknown'}
        />
        <Stat label="Field elev" value={leg.elev == null ? 'unknown' : `${leg.elev.toLocaleString()} ft`} />
      </dl>

      <div className="mt-5 flex items-center gap-5 text-sm">
        <Link
          to="/airport/$id"
          params={{ id: leg.id }}
          className="text-sky underline underline-offset-4"
        >
          Field detail and weather
        </Link>
        <button
          type="button"
          onClick={onLog}
          disabled={logged}
          className="rounded border border-line px-3 py-1 disabled:text-muted"
        >
          {logged ? 'Logged' : 'Add to logbook'}
        </button>
      </div>
    </section>
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

/**
 * The wheel is one way to choose; this is the other. Rows are buttons so the
 * whole list is reachable by keyboard as well as by pointer.
 */
function CandidateList({
  legs,
  picked,
  onPick,
}: {
  legs: ReadonlyArray<Leg>
  picked: string | undefined
  onPick: (id: string) => void
}) {
  return (
    <ul className="mt-2 max-h-96 overflow-y-auto border-t border-line">
      {legs.map((leg) => {
        const active = leg.id === picked
        return (
          <li key={leg.id}>
            <button
              type="button"
              onClick={() => onPick(leg.id)}
              aria-current={active}
              className={`grid w-full grid-cols-[3rem_1fr_9rem_4.5rem_3.5rem] items-baseline gap-x-3 border-b border-line/60 px-1 py-1 text-left font-mono text-xs ${
                active ? 'bg-ink-700' : 'hover:bg-ink-800'
              }`}
            >
              <span className="text-amber">{leg.id}</span>
              <span className="truncate font-sans text-text">{leg.name}</span>
              <span className="truncate text-muted">
                {leg.city}, {leg.state}
              </span>
              <span className="text-right tabular-nums">{leg.distanceNm} nm</span>
              <span className="text-right tabular-nums text-muted">
                {formatMinutes(leg.minutes)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
