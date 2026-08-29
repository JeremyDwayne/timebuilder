import { describe, expect, it } from 'vitest'

import { formatAirportLabel, formatFrequency, formatMinutes, formatSeen } from '~/lib/airport'
import type { Airport } from '~/lib/airport'

describe('formatMinutes', () => {
  it('drops the hour under sixty minutes', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(59)).toBe('59m')
  })

  it('pads the minutes once there is an hour to read against', () => {
    expect(formatMinutes(60)).toBe('1h 00m')
    expect(formatMinutes(85)).toBe('1h 25m')
    expect(formatMinutes(605)).toBe('10h 05m')
  })

  it('rounds a fractional minute before splitting it', () => {
    // 119.6 must not read as "1h 60m".
    expect(formatMinutes(119.6)).toBe('2h 00m')
    expect(formatMinutes(59.4)).toBe('59m')
  })
})

describe('formatFrequency', () => {
  it('writes three decimals, the way a chart prints them', () => {
    expect(formatFrequency(118.6)).toBe('118.600')
    expect(formatFrequency(122.975)).toBe('122.975')
    expect(formatFrequency(121)).toBe('121.000')
  })
})

describe('formatAirportLabel', () => {
  it('leads with the identifier', () => {
    const airport = { id: 'SQL', name: 'San Carlos' } as Airport
    expect(formatAirportLabel(airport)).toBe('SQL San Carlos')
  })
})


describe('formatSeen', () => {
  it('reads the stored month back as a date a person would say', () => {
    expect(formatSeen('2026-08')).toBe('seen Aug 2026')
    expect(formatSeen('2015-03')).toBe('seen Mar 2015')
  })

  it('says nothing rather than something wrong when there is no date', () => {
    expect(formatSeen(null)).toBeNull()
    expect(formatSeen('')).toBeNull()
    expect(formatSeen('2026')).toBeNull()
    expect(formatSeen('2026-13')).toBeNull()
  })
})
