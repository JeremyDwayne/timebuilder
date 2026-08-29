import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

/**
 * Deployment runtime is selected here and nowhere else. Nitro presets swap the
 * server output (node-server, cloudflare_module, netlify, vercel, bun, ...)
 * without any change to routes, loaders, or server functions.
 * Override per environment with NITRO_PRESET.
 */
const preset = process.env.NITRO_PRESET ?? 'node-server'

export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart({
      // Fail loudly in dev too, instead of silently mocking a leaked server module.
      importProtection: { behavior: 'error' },
    }),
    nitro({ preset }),
    viteReact(),
    tailwindcss(),
  ],
})
