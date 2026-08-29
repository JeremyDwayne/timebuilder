import { useId } from 'react'

/**
 * The wheel and the hundred-dollar hamburger in one glyph: a burger cropped to
 * a disc, layers read by the gaps rather than by colour. Two shapes, so it
 * survives a 16px tab. Kept in step with public/favicon.svg.
 */
export function Mark({ className }: { className?: string }) {
  // A document may hold more than one of these, and two clip paths sharing an id
  // is invalid. React's generated ids carry punctuation that url() cannot take.
  const clipId = `mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="29" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="29" fill="var(--color-amber)" />
      <g clipPath={`url(#${clipId})`} fill="var(--color-ink-900)">
        <rect x="-2" y="26" width="68" height="5" rx="2.5" />
        <rect x="-2" y="40" width="68" height="5" rx="2.5" />
      </g>
    </svg>
  )
}
