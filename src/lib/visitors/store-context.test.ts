import { describe, expect, it } from 'vitest'
import {
  brandSlugFromHost,
  hostFromOrigin,
  normalizeOrigin,
} from '@/lib/visitors/store-context'

describe('store-context helpers', () => {
  it('normalizes origins and strips www', () => {
    expect(normalizeOrigin('https://www.divyaprabhafoods.com/path')).toBe(
      'https://www.divyaprabhafoods.com',
    )
    expect(hostFromOrigin('https://www.divyaprabhafoods.com')).toBe(
      'divyaprabhafoods.com',
    )
  })

  it('extracts brand slug from custom domain', () => {
    expect(brandSlugFromHost('divyaprabhafoods.com')).toBe('divyaprabhafoods')
    expect(brandSlugFromHost('www.thepickleaffair.com')).toBe('thepickleaffair')
  })
})
