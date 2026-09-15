import { describe, expect, it } from 'vitest'
import {
  formatMetaStatusErrors,
  formatWhatsAppErrorMessage,
  isMetaMarketingHoldCode,
  isMetaMarketingOptOutCode,
} from './format-error-message'

describe('formatWhatsAppErrorMessage', () => {
  it('maps known Meta codes to actionable guidance', () => {
    const formatted = formatWhatsAppErrorMessage(
      '#131048 — Spam Rate limit hit — This message was not delivered',
    )
    expect(formatted).toContain('#131048')
    expect(formatted).toContain('quality restriction')
  })

  it('does not treat media upload #131053 as an opt-out', () => {
    const formatted = formatWhatsAppErrorMessage('#131053 — Media upload error')
    expect(formatted).toContain('#131053')
    expect(formatted.toLowerCase()).not.toContain('opted out')
    expect(formatted.toLowerCase()).toContain('header image')
  })

  it('maps #131050 to marketing opt-out', () => {
    const formatted = formatWhatsAppErrorMessage('#131050 — Unable to deliver')
    expect(formatted).toContain('opted out')
  })

  it('returns null for empty input', () => {
    expect(formatWhatsAppErrorMessage(null)).toBeNull()
    expect(formatWhatsAppErrorMessage('   ')).toBeNull()
  })

  it('passes through unknown errors unchanged', () => {
    const raw = '#999999 — Unknown failure'
    expect(formatWhatsAppErrorMessage(raw)).toBe(raw)
  })
})

describe('isMetaMarketingOptOutCode', () => {
  it('is only 131050', () => {
    expect(isMetaMarketingOptOutCode(131050)).toBe(true)
    expect(isMetaMarketingOptOutCode(131052)).toBe(false)
    expect(isMetaMarketingOptOutCode(131053)).toBe(false)
  })
})

describe('isMetaMarketingHoldCode', () => {
  it('covers quality and per-user marketing caps', () => {
    expect(isMetaMarketingHoldCode(131048)).toBe(true)
    expect(isMetaMarketingHoldCode(131049)).toBe(true)
    expect(isMetaMarketingHoldCode(131056)).toBe(true)
    expect(isMetaMarketingHoldCode(131053)).toBe(false)
  })
})

describe('formatMetaStatusErrors', () => {
  it('includes error_data.details and dedupes title/message', () => {
    expect(
      formatMetaStatusErrors([
        {
          code: 131053,
          title: 'Media upload error',
          message: 'Media upload error',
          error_data: { details: 'Unsupported image type' },
        },
      ]),
    ).toBe('#131053 — Media upload error — Unsupported image type')
  })
})
