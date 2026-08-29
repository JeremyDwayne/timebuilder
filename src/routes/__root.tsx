import type { ReactNode } from 'react'
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'

import appCss from '~/styles.css?url'
import { NotFound } from '~/components/NotFound'
import { RouteError } from '~/components/RouteError'

/**
 * Owns the entire document. Start renders this on the server for every request,
 * so `<html>` down is server-rendered HTML rather than a shell the client fills in.
 */
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Time Builder' },
      {
        name: 'description',
        content:
          'Spin a wheel of public-use airports within a chosen flight time of your home field.',
      },
      { name: 'theme-color', content: '#0b0f14' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-5xl items-baseline gap-6 px-4 py-3">
            <Link to="/" search={{}} className="font-mono text-sm font-semibold tracking-tight">
              TIME<span className="text-amber">BUILDER</span>
            </Link>
            <Link
              to="/logbook"
              className="text-sm text-muted hover:text-text"
              activeProps={{ className: 'text-sm text-text' }}
            >
              Logbook
            </Link>
            <span className="ml-auto font-mono text-xs text-muted">
              US public-use fields, FAA data
            </span>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-10 font-mono text-xs text-muted">
          Planning aid only. Check current charts, NOTAMs and the Chart Supplement before you fly.
        </footer>
        <Scripts />
      </body>
    </html>
  )
}
