import type { Leg } from '~/lib/airport'
import { readJson, writeJson } from '~/lib/storage'

/**
 * Spins the pilot has decided to fly, kept in localStorage. Nothing here is
 * server state, which is why the logbook route opts out of SSR entirely.
 */

const KEY = 'timebuilder.logbook.v1'

export type LogEntry = {
  id: string
  name: string
  city: string
  state: string
  from: string
  distanceNm: number
  minutes: number
  /** ISO timestamp of when the spin was logged. */
  loggedAt: string
}

function write(entries: Array<LogEntry>): Array<LogEntry> {
  writeJson(KEY, entries)
  return entries
}

function read(): Array<LogEntry> {
  const stored = readJson(KEY)
  return Array.isArray(stored) ? (stored as Array<LogEntry>) : []
}

export function listEntries(): Array<LogEntry> {
  return read().sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
}

export function addEntry(leg: Leg, from: string, loggedAt: string): Array<LogEntry> {
  const entry: LogEntry = {
    id: leg.id,
    name: leg.name,
    city: leg.city,
    state: leg.state,
    from,
    distanceNm: leg.distanceNm,
    minutes: leg.minutes,
    loggedAt,
  }
  return write([entry, ...read()].slice(0, 200))
}

export function removeEntry(loggedAt: string): Array<LogEntry> {
  return write(read().filter((entry) => entry.loggedAt !== loggedAt))
}

/** Total hours across every logged spin, counting the return leg. */
export function totalHours(entries: ReadonlyArray<LogEntry>): number {
  return entries.reduce((sum, entry) => sum + (entry.minutes * 2) / 60, 0)
}
