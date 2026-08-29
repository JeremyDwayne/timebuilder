import { type } from 'arktype'

import { spinQuery, type SpinQuery } from '~/lib/search'
import { readJson, removeKey, writeJson } from '~/lib/storage'

/**
 * The pilot's own setup, remembered between visits.
 *
 * A departure field, a cruise speed and a runway minimum describe the aeroplane
 * and the home airport, not the trip, so they should not have to be re-entered
 * every visit. The URL stays the source of truth for any given spin; this is
 * only what a bare visit starts from.
 *
 * Stored values are re-validated through the same schema the address bar uses,
 * so a blob left by an older version cannot put the app into a state the URL
 * could not.
 */

const KEY = 'timebuilder.preferences.v1'

/**
 * Anything the schema does not declare is dropped rather than carried through,
 * so a `pick` left in an older blob cannot resurrect one spin's destination as
 * if it were a standing preference.
 */
const storedPreferences = spinQuery.onUndeclaredKey('delete')

/** The saved setup, or null when nothing usable is stored. */
export function readPreferences(): SpinQuery | null {
  const stored = readJson(KEY)
  if (stored === undefined || stored === null || typeof stored !== 'object') return null
  const parsed = storedPreferences(stored)
  return parsed instanceof type.errors ? null : parsed
}

export function writePreferences(query: SpinQuery): void {
  writeJson(KEY, query)
}

export function clearPreferences(): void {
  removeKey(KEY)
}
