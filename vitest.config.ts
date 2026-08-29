import { defineConfig } from 'vitest/config'

/**
 * Deliberately separate from vite.config.ts: the tests cover pure modules and
 * the generated tables, so none of the Start, Nitro or Tailwind plugins need to
 * run for them.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ['src/**/*.test.ts'] },
})
