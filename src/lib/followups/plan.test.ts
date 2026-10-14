import { describe, expect, it } from 'vitest'
import {
  followupProductsFromLineItems,
  initialPlan,
  isStageStale,
  joinProductNames,
  knownReviewHandle,
  newFollowupToken,
  nextPlan,
  reorderCartPath,
  reviewUrl,
  shortProductName,
  unopenedReviewProducts,
  type FollowupProduct,
} from './plan'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** 2026-10-14 12:00 IST — inside the 09:30–20:30 send window. */
const NOON_IST = new Date('2026-10-14T06:30:00Z')

describe('followupProductsFromLineItems', () => {
  it('lists each pickle once and keeps every variant for the reorder cart', () => {
    const products = followupProductsFromLineItems([
      { title: 'Gunda Keri | Lasode ka Achar', product_id: 9374510907606, variant_id: 48331213177046, quantity: 1 },
      { title: 'Gor Keri | Jaggery Mango Achar', product_id: 9374511202518, variant_id: 48331213537494, quantity: 2 },
      { title: 'Gunda Keri | Lasode ka Achar', product_id: 9374510907606, variant_id: 48331213144278, quantity: 1 },
      { title: 'Gift card', gift_card: true, product_id: 1, variant_id: 2, quantity: 1 },
    ])
    expect(products.map((p) => p.title)).toEqual(['Gunda Keri', 'Gor Keri'])
    expect(products[0].variants).toEqual([
      { variant_id: '48331213177046', quantity: 1 },
      { variant_id: '48331213144278', quantity: 1 },
    ])
    expect(reorderCartPath(products)).toBe(
      'cart/48331213177046:1,48331213144278:1,48331213537494:2',
    )
  })

  it('drops sold-out variants from the reorder cart', () => {
    const products = followupProductsFromLineItems([
      { title: 'Chhundo', product_id: 1, variant_id: 11, quantity: 1 },
      { title: 'Gor Keri', product_id: 2, variant_id: 22, quantity: 1 },
    ])
    expect(reorderCartPath(products, new Set(['11']))).toBe('cart/22:1')
    expect(reorderCartPath(products, new Set(['11', '22']))).toBeNull()
  })
})

describe('names and review links', () => {
  it('shortens Shopify titles and joins them in Hinglish', () => {
    expect(shortProductName('Homemade Mango Pickle | Aam ka Achar')).toBe('Homemade Mango Pickle')
    expect(joinProductNames(['Gunda Keri'])).toBe('Gunda Keri')
    expect(joinProductNames(['Gunda Keri', 'Gor Keri'])).toBe('Gunda Keri aur Gor Keri')
    expect(joinProductNames(['A', 'B', 'C'])).toBe('A, B aur C')
    expect(joinProductNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C + 2 more')
  })

  it('knows the review page of every pickle by name', () => {
    expect(knownReviewHandle('Methia Keri | Chana Keri Methi Achar')).toBe(
      'chana-keri-methi-pickle-gujarati-methia-achar',
    )
    expect(knownReviewHandle('Something new')).toBeNull()
    expect(reviewUrl('gor-keri-pickle-jaggery-mango-achar-gujarati')).toBe(
      'https://divyaprabhafoods.com/products/gor-keri-pickle-jaggery-mango-achar-gujarati?review=1',
    )
  })

  it('reminds only about products whose review page was not opened', () => {
    const products: FollowupProduct[] = [
      { product_id: '1', title: 'Gunda Keri', handle: 'gunda', image_url: null, variants: [], opened_at: '2026-10-15T06:00:00Z' },
      { product_id: '2', title: 'Gor Keri', handle: 'gor', image_url: null, variants: [] },
      { product_id: '3', title: 'No page', handle: null, image_url: null, variants: [] },
    ]
    expect(unopenedReviewProducts(products).map((p) => p.title)).toEqual(['Gor Keri'])
  })

  it('makes URL-safe tokens', () => {
    expect(newFollowupToken()).toMatch(/^[A-Za-z0-9_-]{12}$/)
  })
})

describe('initialPlan', () => {
  it('asks for a review 24h after delivery', () => {
    const plan = initialPlan(NOON_IST, NOON_IST, true)!
    expect(plan.stage).toBe('review_request')
    expect(plan.next_run_at!.getTime()).toBe(NOON_IST.getTime() + DAY)
  })

  it('moves a night-time send to 9:30 AM IST', () => {
    const delivered = new Date('2026-10-14T17:00:00Z') // 22:30 IST
    const plan = initialPlan(delivered, delivered, true)!
    expect(plan.next_run_at!.toISOString()).toBe('2026-10-16T04:00:00.000Z')
  })

  it('sends the review now when the delivery is found a few days late', () => {
    const now = new Date(NOON_IST.getTime() + 3 * DAY)
    expect(initialPlan(NOON_IST, now, true)!.next_run_at!.getTime()).toBe(now.getTime())
  })

  it('skips reviews for old deliveries and orders without review pages', () => {
    expect(initialPlan(NOON_IST, new Date(NOON_IST.getTime() + 12 * DAY), true)!.stage).toBe('refill')
    const noPages = initialPlan(NOON_IST, NOON_IST, false)!
    expect(noPages.stage).toBe('refill')
    expect(noPages.next_run_at!.getTime()).toBe(NOON_IST.getTime() + 30 * DAY)
    expect(initialPlan(NOON_IST, new Date(NOON_IST.getTime() + 46 * DAY), true)).toBeNull()
  })
})

describe('nextPlan', () => {
  it('reminds 72h after the review request, then refills at day 30 and 45', () => {
    const requestSent = new Date(NOON_IST.getTime() + DAY)
    const reminder = nextPlan('review_request', NOON_IST, requestSent)
    expect(reminder.stage).toBe('review_reminder')
    expect(reminder.next_run_at!.getTime()).toBe(requestSent.getTime() + 72 * HOUR)

    const refill = nextPlan('review_reminder', NOON_IST, reminder.next_run_at!)
    expect(refill.stage).toBe('refill')
    expect(refill.next_run_at!.getTime()).toBe(NOON_IST.getTime() + 30 * DAY)

    const followup = nextPlan('refill', NOON_IST, refill.next_run_at!)
    expect(followup.stage).toBe('refill_followup')
    expect(followup.next_run_at!.getTime()).toBe(NOON_IST.getTime() + 45 * DAY)

    expect(nextPlan('refill_followup', NOON_IST, followup.next_run_at!)).toEqual({
      stage: 'done',
      next_run_at: null,
    })
  })

  it('keeps the refill follow-up at least 10 days after a late refill', () => {
    const lateRefill = new Date(NOON_IST.getTime() + 40 * DAY)
    expect(nextPlan('refill', NOON_IST, lateRefill).next_run_at!.getTime()).toBe(
      lateRefill.getTime() + 10 * DAY,
    )
  })
})

describe('isStageStale', () => {
  it('drops review messages after 10 days and refills after 60', () => {
    expect(isStageStale('review_reminder', NOON_IST, new Date(NOON_IST.getTime() + 9 * DAY))).toBe(false)
    expect(isStageStale('review_reminder', NOON_IST, new Date(NOON_IST.getTime() + 11 * DAY))).toBe(true)
    expect(isStageStale('refill_followup', NOON_IST, new Date(NOON_IST.getTime() + 50 * DAY))).toBe(false)
    expect(isStageStale('refill_followup', NOON_IST, new Date(NOON_IST.getTime() + 61 * DAY))).toBe(true)
  })
})
