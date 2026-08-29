import { formatFrequency, type Frequency, type FrequencyType } from '~/lib/airport'

/** Plain-language names, since the source codes are not what a pilot says. */
const NAMES: Record<FrequencyType, string> = {
  CTAF: 'CTAF',
  TWR: 'Tower',
  GND: 'Ground',
  CLD: 'Clearance',
  UNIC: 'UNICOM',
  ATIS: 'ATIS',
  AWOS: 'AWOS',
  ASOS: 'ASOS',
  AFIS: 'AFIS',
}

const WEATHER: ReadonlySet<FrequencyType> = new Set(['ATIS', 'AWOS', 'ASOS', 'AFIS'])

export function FrequencyTable({ frequencies }: { frequencies: ReadonlyArray<Frequency> }) {
  if (frequencies.length === 0) {
    return <p className="mt-2 text-sm text-muted">No frequencies on file for this field.</p>
  }

  const traffic = frequencies.filter((f) => !WEATHER.has(f.type))
  const weather = frequencies.filter((f) => WEATHER.has(f.type))

  return (
    <div className="mt-2 grid gap-x-10 gap-y-4 sm:grid-cols-2">
      <Group title="Traffic" rows={traffic} />
      <Group title="Weather" rows={weather} />
    </div>
  )
}

function Group({ title, rows }: { title: string; rows: ReadonlyArray<Frequency> }) {
  return (
    <div>
      <p className="font-mono text-xs text-muted">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-1 font-mono text-xs text-muted">none published</p>
      ) : (
        <table className="mt-1 w-full font-mono text-sm">
          <tbody>
            {rows.map((frequency) => (
              <tr key={`${frequency.type}-${frequency.mhz}`} className="border-b border-line/60">
                <td className="w-24 py-1 text-text">{NAMES[frequency.type]}</td>
                <td className="py-1 tabular-nums text-amber">{formatFrequency(frequency.mhz)}</td>
                <td className="py-1 pl-3 text-right text-xs text-muted">
                  {frequency.label && frequency.label.toUpperCase() !== frequency.type
                    ? frequency.label
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
