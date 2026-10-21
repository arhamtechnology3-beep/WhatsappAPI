import { describe, expect, it } from 'vitest'
import { shouldStopInquiryDrip } from '@/lib/shopify/recovery-conversion'
import {
  deferInquirySendAt,
  evaluateInquiryEligibility,
  extractProductHintFromTexts,
  inquirySilenceElapsed,
  inquiryWithinLookback,
} from './inquiry-followup'

const NOON_UTC = new Date('2026-10-21T06:30:00.000Z') // 12:00 IST

describe('inquiry follow-up eligibility', () => {
  it('requires 4h silence and lookback window', () => {
    const fiveHoursAgo = new Date(NOON_UTC.getTime() - 5 * 3600_000).toISOString()
    const oneHourAgo = new Date(NOON_UTC.getTime() - 1 * 3600_000).toISOString()
    const tenDaysAgo = new Date(NOON_UTC.getTime() - 10 * 86400_000).toISOString()

    expect(inquirySilenceElapsed(fiveHoursAgo, NOON_UTC)).toBe(true)
    expect(inquirySilenceElapsed(oneHourAgo, NOON_UTC)).toBe(false)
    expect(inquiryWithinLookback(fiveHoursAgo, NOON_UTC)).toBe(true)
    expect(inquiryWithinLookback(tenDaysAgo, NOON_UTC)).toBe(false)
  })

  it('enrolls quiet inquirers with phone and no order', () => {
    const last = new Date(NOON_UTC.getTime() - 6 * 3600_000).toISOString()
    expect(
      evaluateInquiryEligibility({
        lastCustomerMessageAt: last,
        hasPhone: true,
        hasOrder: false,
        optedOut: false,
        alreadyInInquiryDrip: false,
        inOtherRecoveryDrip: false,
        now: NOON_UTC,
      }),
    ).toEqual({ eligible: true })
  })

  it('skips purchasers, opted-out, and active drips', () => {
    const last = new Date(NOON_UTC.getTime() - 6 * 3600_000).toISOString()
    const base = {
      lastCustomerMessageAt: last,
      hasPhone: true,
      hasOrder: false,
      optedOut: false,
      alreadyInInquiryDrip: false,
      inOtherRecoveryDrip: false,
      now: NOON_UTC,
    }
    expect(evaluateInquiryEligibility({ ...base, hasOrder: true }).reason).toBe(
      'already_purchased',
    )
    expect(evaluateInquiryEligibility({ ...base, optedOut: true }).reason).toBe(
      'opted_out',
    )
    expect(
      evaluateInquiryEligibility({ ...base, alreadyInInquiryDrip: true }).reason,
    ).toBe('already_enrolled')
    expect(
      evaluateInquiryEligibility({ ...base, inOtherRecoveryDrip: true }).reason,
    ).toBe('other_drip_active')
  })

  it('stops when they purchase', () => {
    expect(shouldStopInquiryDrip(true)).toBe(true)
    expect(shouldStopInquiryDrip(false)).toBe(false)
  })
})

describe('extractProductHintFromTexts', () => {
  it('reads product URL from agent links', () => {
    const hint = extractProductHintFromTexts([
      'Try this: https://divyaprabhafoods.com/products/gor-keri-pickle thanks',
    ])
    expect(hint.product_title).toMatch(/Gor Keri/i)
    expect(hint.product_url).toContain('/products/gor-keri-pickle')
  })

  it('falls back to chat keywords then default', () => {
    expect(
      extractProductHintFromTexts(['Thanks i wil surely order Special mango']).product_title,
    ).toBe('Special mango less spicy')
    expect(extractProductHintFromTexts(['ok']).product_title).toBe('handmade pickles')
  })
})

describe('deferInquirySendAt', () => {
  it('clamps deferred sends into the IST window', () => {
    // 22:00 IST = 16:30 UTC → defer 4h = 02:00 IST next day → clamp to 09:30
    const late = new Date('2026-10-21T16:30:00.000Z')
    const deferred = deferInquirySendAt(late, 4)
    expect(deferred.toISOString()).toBe('2026-10-22T04:00:00.000Z') // 09:30 IST
  })
})
