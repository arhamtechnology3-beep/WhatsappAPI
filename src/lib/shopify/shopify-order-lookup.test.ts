import { describe, expect, it } from 'vitest'
import {
  awbFromTrackingUrl,
  formatOrderStatusMessage,
  orderMatchesQuery,
  orderNumberCandidates,
} from './shopify-order-lookup'

describe('orderNumberCandidates', () => {
  it('covers 1006, #1006, and digit-only forms', () => {
    expect(orderNumberCandidates('1006')).toEqual(
      expect.arrayContaining(['1006', '#1006']),
    )
    expect(orderNumberCandidates('#1006')).toEqual(
      expect.arrayContaining(['1006', '#1006']),
    )
  })
})

describe('orderMatchesQuery', () => {
  it('matches Shopify name #1006 to typed 1006', () => {
    expect(orderMatchesQuery({ name: '#1006', order_number: 1006 }, '1006')).toBe(
      true,
    )
  })

  it('matches DivyaPrabha DP/26/1009 suffix', () => {
    expect(
      orderMatchesQuery({ name: 'DP/26/1009', order_number: 1009 }, '1009'),
    ).toBe(true)
  })

  it('rejects a different order', () => {
    expect(orderMatchesQuery({ name: '#1001', order_number: 1001 }, '1006')).toBe(
      false,
    )
  })
})

describe('formatOrderStatusMessage', () => {
  const parcel = {
    name: 'DP/26/1012',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    total_price: '1887.30',
    currency: 'INR',
    line_items: [
      { title: 'Methia Keri | Chana Keri Methi Achar', quantity: 1 },
      { title: 'Gor Keri | Jaggery Mango Achar', variant_title: '500 g', quantity: 1 },
    ],
    fulfillments: [
      {
        tracking_number: 'SRSP5359042244',
        tracking_company: 'Ekart Surface 2kg',
        shipment_status: 'in_transit',
      },
    ],
  }

  it('never says "mil gaya" or a raw "fulfilled" for an undelivered parcel', () => {
    const text = formatOrderStatusMessage(parcel)
    expect(text).not.toMatch(/mil gaya/i)
    expect(text).not.toMatch(/fulfilled/i)
    expect(text).toContain('Raste mein hai')
    expect(text).toContain('Gor Keri | Jaggery Mango Achar (500 g) × 1')
    expect(text).toContain('₹1887.30 (Paid)')
    expect(text).toContain('Talk to agent')
  })

  it('uses live courier status, location, EDD and flags a missed delivery date', () => {
    const text = formatOrderStatusMessage(parcel, {
      live: {
        awb: 'SRSP5359042244',
        status: 'REACHED AT DESTINATION HUB',
        milestone: 'skip',
        courier: 'Ekart Surface 2kg',
        edd: '2026-10-10 00:00:00',
        deliveredAt: '',
        lastActivity: '',
        lastLocation: 'VakolaHub_MUM MUMBAI',
        lastActivityAt: '2026-10-09 15:45:35',
        trackUrl: 'https://divyaprabhafoods.shiprocket.co/tracking/SRSP5359042244',
      },
      now: new Date('2026-10-11T12:00:00Z'),
    })
    expect(text).toContain('Raste mein hai')
    expect(text).toContain('VakolaHub_MUM MUMBAI (9 Oct)')
    expect(text).toContain('Expected delivery: 10 Oct')
    expect(text).toContain('Expected date nikal gayi hai')
    expect(text).toContain('shiprocket.co/tracking/SRSP5359042244')
  })

  it('says delivered only when the courier confirms it', () => {
    const text = formatOrderStatusMessage(parcel, {
      live: {
        awb: '1',
        status: 'Delivered',
        milestone: 'delivered',
        courier: 'Delhivery Surface',
        edd: '2026-10-11 00:00:00',
        deliveredAt: '2026-10-11 15:26:20',
        lastActivity: '',
        lastLocation: '',
        lastActivityAt: '',
        trackUrl: '',
      },
    })
    expect(text).toContain('Deliver ho gaya ✅')
    expect(text).toContain('Delivered on: 11 Oct')
  })
})

describe('awbFromTrackingUrl', () => {
  it('reads the AWB from a Shiprocket tracking link', () => {
    expect(
      awbFromTrackingUrl('https://divyaprabhafoods.shiprocket.co/tracking/SRSP5359042244'),
    ).toBe('SRSP5359042244')
  })
})
