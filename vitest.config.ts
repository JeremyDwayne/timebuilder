import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'

/**
 * Deliberately separate from vite.config.ts: none of the Start, Nitro or
 * Tailwind plugins need to run for the tests, only the JSX transform.
 *
 * Node is the default environment. The files that need a DOM or a localStorage
 * opt in with a `@vitest-environment jsdom` docblock, so a pure module is never
 * tested against a browser it will not run in.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [viteReact()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
  },
})
