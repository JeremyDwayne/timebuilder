/**
 * localStorage that never throws. It is absent during SSR, refused outright in
 * some private-browsing modes, and throws at quota, so every caller here treats
 * a failure as "this value does not survive a reload" rather than an error.
 */

/** Parsed JSON at `key`, or undefined when absent, unreadable, or off-browser. */
export function readJson(key: string): unknown {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** Stores `value` at `key`. A refusal is silent by design. */
export function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing to recover: the caller's in-memory copy is still correct.
  }
}

export function removeKey(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // As above.
  }
}
