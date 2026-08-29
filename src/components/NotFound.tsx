import { Link } from '@tanstack/react-router'

export function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="font-mono text-sm text-amber">404</p>
      <h1 className="mt-2 text-xl font-semibold">No such airport or page</h1>
      <Link to="/" className="mt-6 inline-block text-sm text-sky underline underline-offset-4">
        Back to the wheel
      </Link>
    </div>
  )
}
