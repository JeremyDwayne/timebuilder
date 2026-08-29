import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

/**
 * Deployment runtime is selected here and nowhere else. Nitro presets swap the
 * server output (node-server, cloudflare_module, netlify, vercel, bun, ...)
 * without any change to routes, loaders, or server functions.
 *
 * Left undefined, Nitro reads the host it is building on: Vercel, Netlify and
 * Cloudflare all identify themselves through the environment, and a plain
 * checkout falls back to node-server. Set NITRO_PRESET to override.
 */
const preset = process.env.NITRO_PRESET

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
