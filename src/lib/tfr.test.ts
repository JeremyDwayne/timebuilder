import { describe, expect, it } from 'vitest'

import { isNationwide } from '~/lib/tfr'

describe('isNationwide', () => {
  it('treats a two-letter state code as local', () => {
    expect(isNationwide('FL')).toBe(false)
    expect(isNationwide(' ca ')).toBe(false)
  })

  it('treats the feed markers for a nationwide restriction as nationwide', () => {
    // These are the values that made the old state-set match drop every
    // nationwide security notice.
    expect(isNationwide('USA')).toBe(true)
    expect(isNationwide('')).toBe(true)
    expect(isNationwide('  ')).toBe(true)
  })
})
