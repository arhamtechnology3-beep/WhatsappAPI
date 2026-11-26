import { describe, expect, it } from 'vitest'
import {
  clampToIstSendWindow,
  isInsideIstSendWindow,
  shouldClampWelcomeFollowup,
  shouldDeferOutsideIstWindow,
} from './send-window'

describe('IST send window 09:30–20:30', () => {
  it('keeps a 3pm IST time unchanged', () => {
    // 15:00 IST = 09:30 UTC
    const when = new Date('2026-08-23T09:30:00.000Z')
    expect(isInsideIstSendWindow(when)).toBe(true)
    expect(clampToIstSendWindow(when).toISOString()).toBe(when.toISOString())
  })

  it('moves 8pm IST follow-up that lands at 1am IST to next 9:30 AM', () => {
    // 20:00 + 5h = 01:00 IST next day = 19:30 UTC previous day
    const due = new Date('2026-08-23T19:30:00.000Z')
    expect(isInsideIstSendWindow(due)).toBe(false)
    const clamped = clampToIstSendWindow(due)
    expect(isInsideIstSendWindow(clamped)).toBe(true)
    // 09:30 IST 24 Aug = 04:00 UTC
    expect(clamped.toISOString()).toBe('2026-08-24T04:00:00.000Z')
  })

  it('moves 6am IST up to 9:30 AM the same day', () => {
    const due = new Date('2026-08-23T00:30:00.000Z') // 06:00 IST
    expect(clampToIstSendWindow(due).toISOString()).toBe(
      '2026-08-23T04:00:00.000Z',
    )
  })
})

describe('shouldClampWelcomeFollowup', () => {
  it('only clamps Shopify welcome step 2+', () => {
    expect(
      shouldClampWelcomeFollowup({
        triggerType: 'shopify_customer_created',
        currentStep: 2,
      }),
    ).toBe(true)
    expect(
      shouldClampWelcomeFollowup({
        triggerType: 'shopify_customer_created',
        currentStep: 1,
      }),
    ).toBe(false)
    expect(
      shouldClampWelcomeFollowup({
        triggerType: 'cart_abandoned',
        currentStep: 2,
      }),
    ).toBe(false)
  })

  it('clamps every inquiry no-purchase step into IST hours', () => {
    expect(
      shouldClampWelcomeFollowup({
        triggerType: 'inquiry_no_purchase',
        currentStep: 1,
      }),
    ).toBe(true)
    expect(
      shouldClampWelcomeFollowup({
        triggerType: 'inquiry_no_purchase',
        currentStep: 3,
      }),
    ).toBe(true)
  })
})

describe('shouldDeferOutsideIstWindow', () => {
  it('sends on the midnight UTC tick instead of waiting for 9:30 IST', () => {
    // 00:00 UTC = 05:30 IST — Hostinger once-daily cron
    const now = new Date('2026-11-26T00:00:00.000Z')
    const decision = shouldDeferOutsideIstWindow(now)
    expect(decision.defer).toBe(false)
    expect(decision.reason).toBe('before_open_send_now')
  })

  it('defers after 8:30 PM IST to next morning', () => {
    // 21:00 IST = 15:30 UTC
    const now = new Date('2026-11-26T15:30:00.000Z')
    const decision = shouldDeferOutsideIstWindow(now)
    expect(decision.defer).toBe(true)
    expect(decision.reason).toBe('after_close')
    expect(decision.nextAt.toISOString()).toBe('2026-11-27T04:00:00.000Z')
  })

  it('does not defer inside the window', () => {
    const now = new Date('2026-11-26T09:00:00.000Z') // 14:30 IST
    expect(shouldDeferOutsideIstWindow(now).defer).toBe(false)
  })
})
