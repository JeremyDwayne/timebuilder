import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'
import { NotFound } from './components/NotFound'
import { RouteError } from './components/RouteError'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Loaders are cheap in-memory lookups; a short stale window keeps re-spins snappy.
    defaultStaleTime: 30_000,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: RouteError,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
