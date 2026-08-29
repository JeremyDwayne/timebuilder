// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { clearPreferences, readPreferences, writePreferences } from '~/lib/preferences'
import type { SpinQuery } from '~/lib/search'

const KEY = 'timebuilder.preferences.v1'

const setup: SpinQuery = {
  from: 'SQL',
  min: 0.75,
  max: 2.5,
  speed: 135,
  rwy: 3000,
  paved: true,
  iap: false,
}

afterEach(() => window.localStorage.clear())

describe('readPreferences', () => {
  it('gives nothing before the pilot has set anything up', () => {
    expect(readPreferences()).toBeNull()
  })

  it('returns the setup that was saved', () => {
    writePreferences(setup)
    expect(readPreferences()).toEqual(setup)
  })

  it('fills the gaps in a blob written by an older version', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ from: 'LAL', speed: 120 }))
    expect(readPreferences()).toEqual({
      from: 'LAL',
      min: 1,
      max: 4,
      speed: 120,
      rwy: 2000,
      paved: true,
      iap: false,
    })
  })

  it('clamps a stored value the address bar would have clamped', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ ...setup, speed: 9000, rwy: -20 }))
    expect(readPreferences()).toMatchObject({ speed: 400, rwy: 0 })
  })

  it('refuses a blob it cannot read as a setup', () => {
    for (const raw of ['{not json', '"a string"', '42', 'null']) {
      window.localStorage.setItem(KEY, raw)
      expect(readPreferences()).toBeNull()
    }
  })

  it('refuses a blob whose fields are the wrong shape', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ from: 'SQL', paved: 'yes' }))
    expect(readPreferences()).toBeNull()
  })

  it('never carries a pick, which belongs to one spin rather than to the pilot', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ ...setup, pick: 'LVK' }))
    expect(readPreferences()).not.toHaveProperty('pick')
  })
})

describe('clearPreferences', () => {
  it('puts the app back to a first visit', () => {
    writePreferences(setup)
    clearPreferences()
    expect(readPreferences()).toBeNull()
  })
})
