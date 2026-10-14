import { describe, expect, it } from 'vitest'
import {
  fulfillmentTrackingNumber,
  fulfillmentTrackingUrl,
  isFreshDelivery,
  latestFulfillment,
} from './fulfillment-tracking'

describe('latestFulfillment', () => {
  it('picks the most recently updated live fulfillment (courier re-booked)', () => {
    const f = latestFulfillment([
      { status: 'success', tracking_number: 'OLD', updated_at: '2026-10-10T10:00:00+05:30' },
      { status: 'success', tracking_number: 'NEW', updated_at: '2026-10-13T13:57:14+05:30' },
    ])
    expect(fulfillmentTrackingNumber(f)).toBe('NEW')
  })

  it('ignores cancelled fulfillments', () => {
    const f = latestFulfillment([
      { status: 'success', tracking_number: 'LIVE', updated_at: '2026-10-10T10:00:00Z' },
      { status: 'cancelled', tracking_number: 'DEAD', updated_at: '2026-10-12T10:00:00Z' },
    ])
    expect(fulfillmentTrackingNumber(f)).toBe('LIVE')
  })

  it('returns null when there is nothing live', () => {
    expect(latestFulfillment([])).toBeNull()
    expect(latestFulfillment(undefined)).toBeNull()
    expect(latestFulfillment([{ status: 'cancelled' }])).toBeNull()
  })

  it('reads tracking from the array fields too', () => {
    const f = { tracking_numbers: ['90691850911'], tracking_urls: ['https://x.shiprocket.co/tracking/90691850911'] }
    expect(fulfillmentTrackingNumber(f)).toBe('90691850911')
    expect(fulfillmentTrackingUrl(f)).toBe('https://x.shiprocket.co/tracking/90691850911')
  })
})

describe('isFreshDelivery', () => {
  const now = new Date('2026-10-14T10:00:00Z')

  it('is true for a delivery in the last 24h', () => {
    expect(isFreshDelivery({ shipment_status: 'delivered', updated_at: '2026-10-14T08:00:00Z' }, now)).toBe(true)
  })

  it('is false for an old delivery or another status', () => {
    expect(isFreshDelivery({ shipment_status: 'delivered', updated_at: '2026-10-10T16:18:24+05:30' }, now)).toBe(false)
    expect(isFreshDelivery({ shipment_status: 'in_transit', updated_at: '2026-10-14T08:00:00Z' }, now)).toBe(false)
    expect(isFreshDelivery({ shipment_status: 'delivered' }, now)).toBe(false)
  })
})
