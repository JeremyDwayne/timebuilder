import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTtlCache } from '~/server/cache.server'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** A loader that counts its calls, so a cache hit is observable. */
function counted<T>(value: T) {
  let calls = 0
  return {
    load: async () => {
      calls++
      return value
    },
    get calls() {
      return calls
    },
  }
}

describe('createTtlCache', () => {
  it('serves a second read from the cache', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 })
    const loader = counted('a')
    expect(await cache.get('k', loader.load)).toBe('a')
    expect(await cache.get('k', loader.load)).toBe('a')
    expect(loader.calls).toBe(1)
  })

  it('reloads once the value has gone stale', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 })
    const loader = counted('a')
    await cache.get('k', loader.load)
    vi.advanceTimersByTime(1001)
    await cache.get('k', loader.load)
    expect(loader.calls).toBe(2)
  })

  it('keeps keys apart', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 })
    expect(await cache.get('a', async () => 'first')).toBe('first')
    expect(await cache.get('b', async () => 'second')).toBe('second')
    expect(cache.size).toBe(2)
  })

  it('collapses concurrent misses for one key into a single load', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 })
    let calls = 0
    let release!: (value: string) => void
    const load = () => {
      calls++
      return new Promise<string>((resolve) => (release = resolve))
    }

    const all = Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)])
    expect(calls).toBe(1)
    release('a')
    expect(await all).toEqual(['a', 'a', 'a'])
  })

  it('lets the next caller retry after a load rejects', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 })
    await expect(cache.get('k', async () => Promise.reject(new Error('down')))).rejects.toThrow(
      'down',
    )
    expect(await cache.get('k', async () => 'a')).toBe('a')
  })

  it('expires an empty result sooner, so an outage recovers quickly', async () => {
    const cache = createTtlCache<string | null>({ ttlMs: 60_000, emptyTtlMs: 1000 })
    let value: string | null = null
    const load = async () => value

    await cache.get('k', load)
    value = 'a'
    // Still inside the short life of the empty result.
    vi.advanceTimersByTime(500)
    expect(await cache.get('k', load)).toBeNull()
    vi.advanceTimersByTime(600)
    expect(await cache.get('k', load)).toBe('a')
  })

  it('drops the oldest entries past the cap', async () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 3 })
    for (const key of ['a', 'b', 'c', 'd']) await cache.get(key, async () => key)
    expect(cache.size).toBe(3)

    // "a" was the first in and is the one evicted; "d" is still fresh.
    let reloaded = false
    await cache.get('a', async () => ((reloaded = true), 'a'))
    expect(reloaded).toBe(true)

    let reloadedD = false
    await cache.get('d', async () => ((reloadedD = true), 'd'))
    expect(reloadedD).toBe(false)
  })
})
