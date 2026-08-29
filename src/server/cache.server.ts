import '@tanstack/react-start/server-only'

/**
 * A small time-to-live cache for outbound API calls.
 *
 * Two jobs: keep repeated page views off the upstream service, and collapse
 * concurrent misses for the same key into a single request, so a burst of
 * traffic cannot fan out into a burst of upstream calls.
 */

type Entry<T> = {
  value: T
  expiresAt: number
}

export type TtlCacheOptions = {
  /** How long a successful value stays fresh. */
  ttlMs: number
  /** Shorter life for empty or failed results, so outages recover quickly. */
  emptyTtlMs?: number
  /** Oldest entries are dropped past this many keys. */
  maxEntries?: number
}

export type TtlCache<T> = {
  /** Returns the cached value, or loads and caches it. */
  get: (key: string, load: () => Promise<T>) => Promise<T>
  readonly size: number
}

export function createTtlCache<T>({
  ttlMs,
  emptyTtlMs = ttlMs,
  maxEntries = 1000,
}: TtlCacheOptions): TtlCache<T> {
  const entries = new Map<string, Entry<T>>()
  const inFlight = new Map<string, Promise<T>>()

  const prune = (now: number) => {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key)
    }
    // Map iterates in insertion order, so the front is the oldest.
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next()
      if (oldest.done) break
      entries.delete(oldest.value)
    }
  }

  return {
    async get(key, load) {
      const now = Date.now()
      const hit = entries.get(key)
      if (hit && hit.expiresAt > now) return hit.value

      const pending = inFlight.get(key)
      if (pending) return pending

      const request = load()
        .then((value) => {
          const empty = value == null
          entries.delete(key)
          entries.set(key, { value, expiresAt: Date.now() + (empty ? emptyTtlMs : ttlMs) })
          prune(Date.now())
          return value
        })
        .finally(() => inFlight.delete(key))

      inFlight.set(key, request)
      return request
    },
    get size() {
      return entries.size
    },
  }
}
