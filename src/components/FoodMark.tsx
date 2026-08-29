/**
 * The one glyph that means "there is something to eat on this field", shared by
 * the candidate list, the field page and the map legend. The map itself draws
 * the same shape straight to canvas in `foodMarkPath`, so the two never drift.
 *
 * A shape rather than a colour, because colour alone cannot carry a distinction
 * this small. It inherits `currentColor`, so the surrounding text decides
 * whether it reads as in range, out of range or picked.
 */
export function FoodMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 10 9"
      width="10"
      height="9"
      fill="currentColor"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d="M0.5 4.4 A4.5 4 0 0 1 9.5 4.4 Z" />
      <rect x="0.5" y="5.1" width="9" height="1.5" />
      <path d="M0.5 7.3 H9.5 V8.2 A0.8 0.8 0 0 1 8.7 9 H1.3 A0.8 0.8 0 0 1 0.5 8.2 Z" />
    </svg>
  )
}

/**
 * The same glyph traced onto a 2D context, centred on `x` and `y` at `width`
 * pixels across. Filled by the caller, so the mark takes whatever colour the dot
 * beside it already has.
 */
export function foodMarkPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
): void {
  // The SVG above is drawn on a 10 by 9 grid; everything here is that grid scaled.
  const u = width / 10
  const left = x - width / 2
  const top = y - (9 * u) / 2

  ctx.beginPath()
  ctx.ellipse(left + 5 * u, top + 4.4 * u, 4.5 * u, 4 * u, 0, Math.PI, 0)
  ctx.closePath()
  ctx.rect(left + 0.5 * u, top + 5.1 * u, 9 * u, 1.5 * u)
  ctx.roundRect(left + 0.5 * u, top + 7.3 * u, 9 * u, 1.7 * u, [0, 0, 0.8 * u, 0.8 * u])
}
