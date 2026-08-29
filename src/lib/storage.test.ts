// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readJson, removeKey, writeJson } from '~/lib/storage'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('readJson and writeJson', () => {
  it('round-trips a value', () => {
    writeJson('k', { a: 1, b: ['two'] })
    expect(readJson('k')).toEqual({ a: 1, b: ['two'] })
  })

  it('gives undefined for a key that was never written', () => {
    expect(readJson('missing')).toBeUndefined()
  })

  it('gives undefined rather than throwing on a corrupt value', () => {
    window.localStorage.setItem('k', '{not json')
    expect(readJson('k')).toBeUndefined()
  })

  it('survives storage that refuses to read or write', () => {
    // Safari private browsing throws from both sides of localStorage.
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => writeJson('k', { a: 1 })).not.toThrow()
    expect(readJson('k')).toBeUndefined()
  })
})

describe('removeKey', () => {
  it('deletes a stored value', () => {
    writeJson('k', 1)
    removeKey('k')
    expect(readJson('k')).toBeUndefined()
  })
})
