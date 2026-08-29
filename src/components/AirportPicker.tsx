import { useEffect, useId, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'

import type { Airport } from '~/lib/airport'
import { suggestAirports } from '~/server/airports.functions'

type Props = {
  value: string
  onChange: (identifier: string) => void
}

/**
 * Departure-field combobox. Typing queries the server-side airport table; the
 * committed value is written straight into the URL by the parent.
 */
export function AirportPicker({ value, onChange }: Props) {
  const suggest = useServerFn(suggestAirports)
  const listId = useId()
  const [text, setText] = useState(value)
  const [matches, setMatches] = useState<Array<Airport>>([])
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Re-sync when the URL changes underneath us, e.g. on back/forward.
  useEffect(() => setText(value), [value])

  useEffect(() => {
    const query = text.trim()
    if (query.length < 2 || query === value) {
      setMatches([])
      return
    }
    let live = true
    const timer = setTimeout(async () => {
      const results = await suggest({ data: { q: query } })
      if (live) setMatches(results)
    }, 150)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [text, value, suggest])

  function commit(identifier: string) {
    clearTimeout(blurTimer.current)
    setOpen(false)
    setText(identifier)
    onChange(identifier)
  }

  return (
    <div className="relative">
      <label htmlFor={listId} className="block font-mono text-xs text-muted">
        Departure
      </label>
      <input
        id={listId}
        value={text}
        autoComplete="off"
        spellCheck={false}
        placeholder="SQL"
        className="mt-1 w-full rounded border border-line bg-ink-800 px-2 py-1.5 font-mono text-sm uppercase sm:w-28"
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((matches[0]?.id ?? text).toUpperCase())
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded border border-line bg-ink-800 shadow-xl">
          {matches.map((airport) => (
            <li key={airport.id}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm hover:bg-ink-700"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(airport.id)}
              >
                <span className="w-10 font-mono text-amber">{airport.id}</span>
                <span className="truncate">{airport.name}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-muted">
                  {airport.city}, {airport.state}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
