import type { ReactNode } from 'react'
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'

import appCss from '~/styles.css?url'
import { Mark } from '~/components/Mark'
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
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
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
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 sm:gap-6">
            <Link
              to="/"
              search={{}}
              className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight"
            >
              <Mark className="size-[18px]" />
              <span>
                TIME<span className="text-amber">BUILDER</span>
              </span>
            </Link>
            <Link
              to="/logbook"
              className="text-sm text-muted hover:text-text"
              activeProps={{ className: 'text-sm text-text' }}
            >
              Logbook
            </Link>
            {/* Provenance, not navigation, so it is the first thing to go on a phone. */}
            <span className="ml-auto hidden font-mono text-xs text-muted sm:block">
              US public-use fields, FAA data
            </span>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-10 text-center font-mono text-xs text-muted">
          <p>
            Planning aid only. Check current charts, NOTAMs and the Chart Supplement before you
            fly.
          </p>
          <p className="mt-1.5 flex flex-wrap items-baseline justify-center gap-x-2">
            {/* Server and browser can straddle midnight on New Year's Eve. */}
            <span suppressHydrationWarning>&copy; {new Date().getFullYear()} Jeremy Winterberg</span>
            <span aria-hidden>&middot;</span>
            <a
              href="https://github.com/JeremyDwayne/timebuilder"
              target="_blank"
              rel="noreferrer"
              className="text-sky underline underline-offset-4"
            >
              Source on GitHub
            </a>
          </p>
        </footer>
        <Scripts />
      </body>
    </html>
  )
}
