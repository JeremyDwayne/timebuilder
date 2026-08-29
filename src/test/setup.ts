/**
 * Node ships its own experimental `localStorage` global that reads as undefined
 * without `--localstorage-file`, and it shadows the one jsdom installs. Tests
 * that exercise stored state get a plain in-memory Storage instead.
 *
 * Only the browser environment is patched; the node environment is left without
 * storage on purpose, since that is what the server sees.
 */

function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, String(value)),
    removeItem: (key) => void entries.delete(key),
    clear: () => entries.clear(),
  }
}

if (typeof window !== 'undefined') {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(window, name, {
      value: memoryStorage(),
      configurable: true,
      writable: true,
    })
  }
}
