import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { AirportPicker } from '~/components/AirportPicker'
import { NumberField } from '~/components/NumberField'
import { DualRangeSlider } from '~/components/DualRangeSlider'
import { formatMinutes } from '~/lib/airport'
import { readPreferences, writePreferences } from '~/lib/preferences'
import { orderedRange, spinSearch } from '~/lib/search'
import { getLegs } from '~/server/airports.functions'

/**
 * Pathless layout shared by the wheel and the map. It owns the validated search
 * params and the one loader both views read, so switching views is a client-side
 * swap with no refetch.
 */
export const Route = createFileRoute('/_planner')({
  validateSearch: spinSearch,
  loaderDeps: ({ search: { from, min, max, speed, rwy, paved, iap, food } }) => ({
    from,
    min,
    max,
    speed,
    rwy,
    paved,
    iap,
    food,
  }),
  loader: ({ deps }) => getLegs({ data: deps }),
  component: PlannerLayout,
})

/** The two views this layout wraps. Editing a control must stay on the current one. */
type PlannerView = '/' | '/map'

function PlannerLayout() {
  const search = Route.useSearch()
  const { origin, legs, matched, truncated, band } = Route.useLoaderData()
  const navigate = useNavigate()
  const committed = orderedRange(search)
  /**
   * What the slider is showing mid-drag. The fields beside it follow this so the
   * numbers keep up with the thumb; the summary line below stays on the
   * committed range, since that is what the loaded results reflect.
   */
  const [dragging, setDragging] = useState<{ min: number; max: number } | null>(null)
  const range = dragging ?? committed

  // The URL caught up, so the draft has served its purpose.
  useEffect(() => setDragging(null), [committed.min, committed.max])
  const view = useRouterState({
    select: (state): PlannerView => (state.location.pathname.endsWith('/map') ? '/map' : '/'),
  })

  /**
   * A visit with no departure airport is a fresh start, so it picks up the
   * saved setup. A shared spin always names its departure field, which is why
   * that one check is enough to leave someone else's link untouched.
   */
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (search.from) return
    const saved = readPreferences()
    // The pick survives the restore, so a link that names only a destination
    // (from the airport page or the logbook) lands back on that destination.
    if (saved) navigate({ to: view, search: { ...saved, pick: search.pick }, replace: true })
    // Mount only: clearing the field later is the pilot starting over, not a
    // cue to put the old airport back.
  }, [])

  /** Every control writes through the URL; the loader reruns from there. */
  const edited = useRef(false)
  const set = (patch: Partial<typeof search>) => {
    edited.current = true
    navigate({
      to: view,
      search: (prev) => ({ ...prev, ...patch, pick: undefined }),
      replace: true,
    })
  }

  /**
   * Saves the setup, on two conditions.
   *
   * A control has to have been touched, so opening someone else's link does not
   * quietly replace your home field with theirs. And the departure identifier
   * has to have resolved to a real airport, so a half-typed or retired code is
   * never the thing you are handed back on your next visit. The pick is left
   * out entirely: it belongs to one spin rather than to the pilot.
   */
  const { from, min, max, speed, rwy, paved, iap, food } = search
  useEffect(() => {
    if (!edited.current || !origin) return
    writePreferences({ from, min, max, speed, rwy, paved, iap, food })
  }, [origin, from, min, max, speed, rwy, paved, iap, food])

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/*
        Two columns on a phone, the original single row from `sm` up. The order
        is the same in both, so the tab order always matches what is on screen:
        where you are leaving from and how fast you fly, then the time band,
        then what the destination has to offer.
      */}
      <div className="grid grid-cols-2 items-end gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-5">
        <AirportPicker value={search.from} onChange={(from) => set({ from })} />
        <NumberField
          label="Cruise speed"
          value={search.speed}
          step={5}
          min={40}
          max={400}
          suffix="kt"
          width="w-full sm:w-20"
          onCommit={(speed) => set({ speed })}
        />

        <div className="col-span-2">
          <span className="block font-mono text-xs text-muted">Leg time each way</span>
          <div className="mt-1 flex items-center gap-2">
            <NumberField
              value={range.min}
              step={0.25}
              min={0}
              max={12}
              suffix="h"
              onCommit={(min) => set({ min })}
            />
            {/* The track takes the space left over on a phone and is fixed from `sm`. */}
            <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
              <DualRangeSlider
                lowLabel="Shortest leg in hours"
                highLabel="Longest leg in hours"
                low={committed.min}
                high={committed.max}
                min={0}
                // Six hours covers any single leg worth flying for hours; the
                // number fields still reach the schema's twelve, and the track
                // stretches if one of them is set past the end.
                max={Math.max(6, Math.ceil(committed.max))}
                step={0.25}
                onDrag={({ low, high }) => setDragging({ min: low, max: high })}
                onCommit={({ low, high }) => {
                  setDragging(null)
                  set({ min: low, max: high })
                }}
              />
            </div>
            <NumberField
              value={range.max}
              step={0.25}
              min={0.25}
              max={12}
              suffix="h"
              onCommit={(max) => set({ max })}
            />
          </div>
        </div>

        <NumberField
          label="Min runway"
          value={search.rwy}
          step={500}
          max={15000}
          suffix="ft"
          width="w-full sm:w-24"
          onCommit={(rwy) => set({ rwy })}
        />

        <div className="flex flex-col gap-2 pb-1 sm:flex-row sm:gap-4 sm:pb-1.5">
          <Toggle label="Paved" checked={search.paved} onChange={(paved) => set({ paved })} />
          <Toggle label="Has approach" checked={search.iap} onChange={(iap) => set({ iap })} />
          <Toggle label="Food on field" checked={search.food} onChange={(food) => set({ food })} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-2 font-mono text-xs">
        {origin ? (
          <>
            <span className="text-text">
              {origin.id} {origin.name}
            </span>
            <span className="text-muted">
              {matched} airports, {band?.minNm}-{band?.maxNm} nm
            </span>
            <span className="text-muted">
              {formatMinutes(committed.min * 60)} to {formatMinutes(committed.max * 60)} each way
            </span>
            {truncated && (
              <span className="text-amber">showing an even sample of {legs.length}</span>
            )}
          </>
        ) : (
          <span className="text-muted">
            {search.from ? `No airport matches ${search.from}` : 'Pick a departure airport'}
          </span>
        )}

        <span className="ml-auto flex gap-3">
          <ViewTab to="/" label="Wheel" />
          <ViewTab to="/map" label="Map" />
        </span>
      </div>

      <Outlet />
    </div>
  )
}

function ViewTab({ to, label }: { to: PlannerView; label: string }) {
  return (
    <Link
      to={to}
      search={(prev) => prev}
      className="text-muted hover:text-text"
      activeProps={{ className: 'text-amber' }}
      activeOptions={{ exact: true }}
    >
      {label}
    </Link>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        className="size-4 accent-[var(--color-amber)]"
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}
