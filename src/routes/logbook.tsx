import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { formatMinutes } from '~/lib/airport'
import { listEntries, removeEntry, totalHours, type LogEntry } from '~/lib/logbook'

/**
 * `ssr: false`: every byte on this page comes from localStorage, so there is
 * nothing for the server to render and no point shipping an empty shell of it.
 * The loader runs during hydration instead.
 */
export const Route = createFileRoute('/logbook')({
  ssr: false,
  loader: () => ({ entries: listEntries() }),
  head: () => ({ meta: [{ title: 'Logbook · Time Builder' }] }),
  component: LogbookPage,
})

function LogbookPage() {
  const initial = Route.useLoaderData()
  const [entries, setEntries] = useState<Array<LogEntry>>(initial.entries)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Logbook</h1>
      <p className="mt-1 font-mono text-xs text-muted">
        {entries.length} {entries.length === 1 ? 'spin' : 'spins'},{' '}
        {totalHours(entries).toFixed(1)} hours round trip. Stored in this browser only.
      </p>

      {entries.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          Nothing logged yet.{' '}
          <Link to="/" search={{}} className="text-sky underline underline-offset-4">
            Spin the wheel
          </Link>{' '}
          and add a destination.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {entries.map((entry) => (
            <li
              key={entry.loggedAt}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 font-mono text-xs"
            >
              <span className="w-20 shrink-0 text-muted">{entry.loggedAt.slice(0, 10)}</span>
              <span className="w-8 shrink-0 text-muted">{entry.from}</span>
              <Link
                to="/airport/$id"
                params={{ id: entry.id }}
                className="w-10 shrink-0 text-amber underline underline-offset-4"
              >
                {entry.id}
              </Link>
              {/* The name drops to its own line on a phone rather than truncating to nothing. */}
              <span className="order-last w-full truncate font-sans text-sm text-text sm:order-none sm:w-auto">
                {entry.name}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-muted">
                {entry.distanceNm} nm · {formatMinutes(entry.minutes * 2)}
              </span>
              <button
                type="button"
                onClick={() => setEntries(removeEntry(entry.loggedAt))}
                className="-my-1 shrink-0 px-1.5 py-1 text-muted hover:text-text"
                aria-label={`Remove ${entry.id}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
