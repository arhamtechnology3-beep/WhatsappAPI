import { describe, expect, it } from 'vitest'
import { cronMatchesNow } from './schedule'

describe('cronMatchesNow', () => {
  it('matches a specific UTC minute and hour', () => {
    const now = new Date(Date.UTC(2026, 7, 14, 9, 0, 0))
    expect(cronMatchesNow('0 9 * * *', now)).toBe(true)
    expect(cronMatchesNow('1 9 * * *', now)).toBe(false)
  })

  it('matches wildcard minutes', () => {
    const now = new Date(Date.UTC(2026, 7, 14, 9, 17, 0))
    expect(cronMatchesNow('* 9 * * *', now)).toBe(true)
  })
})
