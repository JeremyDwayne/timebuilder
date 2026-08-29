import { Link, type ErrorComponentProps } from '@tanstack/react-router'

/**
 * Catches loader and render failures, including search params that are malformed
 * beyond what the schema can clamp back into range.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <p className="font-mono text-sm text-amber">Something went wrong</p>
      <pre className="mt-3 overflow-x-auto rounded border border-line bg-ink-800 p-3 font-mono text-xs text-muted">
        {error.message}
      </pre>
      <div className="mt-6 flex gap-4 text-sm">
        <button type="button" onClick={reset} className="text-sky underline underline-offset-4">
          Try again
        </button>
        <Link to="/" search={{}} className="text-sky underline underline-offset-4">
          Reset the search
        </Link>
      </div>
    </div>
  )
}
