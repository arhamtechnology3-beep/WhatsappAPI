import { describe, expect, it } from 'vitest'
import { shouldStopInquiryDrip } from '@/lib/shopify/recovery-conversion'
import {
  OFFER_UNLOCK_FIRST_DELAY_HOURS,
  OFFER_UNLOCK_LOOKBACK_DAYS,
  OFFER_UNLOCK_TRIGGER,
} from './offer-unlock-followup'

describe('offer unlock follow-up', () => {
  it('uses a dedicated sequence trigger', () => {
    expect(OFFER_UNLOCK_TRIGGER).toBe('offer_unlock_no_purchase')
    expect(OFFER_UNLOCK_FIRST_DELAY_HOURS).toBe(4)
    expect(OFFER_UNLOCK_LOOKBACK_DAYS).toBe(21)
  })

  it('stops when they purchase (same rule as inquiry drip)', () => {
    expect(shouldStopInquiryDrip(true)).toBe(true)
    expect(shouldStopInquiryDrip(false)).toBe(false)
  })
})
