import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OWNER_ORDER_TEMPLATE,
  OWNER_ORDER_TEMPLATE_BODY,
  OWNER_ORDER_TEMPLATE_SAMPLE,
  OWNER_ORDER_TEMPLATE_V2,
  OWNER_ORDER_TEMPLATE_V2_BODY,
  OWNER_ORDER_TEMPLATE_V2_SAMPLE,
  ownerAlertPhones,
  ownerAlertRecipients,
  ownerOrderAlertParams,
  pickOwnerTemplate,
} from './owner-order-alert'

afterEach(() => vi.unstubAllEnvs())

/** Trimmed from the DP/26/1017 orders/create payload (14 Oct 2026). */
const order1017 = {
  name: 'DP/26/1017',
  order_number: 1017,
  total_price: '718.20',
  currency: 'INR',
  financial_status: 'paid',
  gateway: 'Razorpay Magic Checkout',
  phone: null,
  customer: { first_name: 'Sudha', last_name: 'Balachandran', phone: null },
  shipping_address: {
    first_name: 'Sudha',
    last_name: 'Balachandran',
    address1: 'Sai Villa, 20 Union Park, Sion Trombay Road,',
    address2: 'Chembur',
    city: 'Mumbai',
    province: 'Maharashtra',
    zip: '400071',
    phone: '+91 98215 14956',
  },
  line_items: [
    { title: 'Gunda Keri | Lasode ka Achar', variant_title: '250 g', quantity: 1 },
    { title: 'Gor Keri | Jaggery Mango Achar', variant_title: '250 g', quantity: 1 },
  ],
}

describe('ownerAlertRecipients', () => {
  it('defaults to Vidhi, Naman Boss and Jesal in Meta format', () => {
    expect(ownerAlertRecipients()).toEqual([
      { name: 'Vidhi', phone: '919004300378' },
      { name: 'Naman Boss', phone: '919029498911' },
      { name: 'Jesal', phone: '919769104020' },
    ])
  })

  it('reads SHOPIFY_OWNER_ALERT_PHONES, greets bare numbers as Team, drops duplicates', () => {
    vi.stubEnv('SHOPIFY_OWNER_ALERT_PHONES', 'Jesal:+91 97691 04020, 9769104020,9820000000')
    expect(ownerAlertRecipients()).toEqual([
      { name: 'Jesal', phone: '919769104020' },
      { name: 'Team', phone: '919820000000' },
    ])
    expect(ownerAlertPhones()).toEqual(['919769104020', '919820000000'])
  })
})

describe('pickOwnerTemplate', () => {
  it('prefers the approved v2, falls back to an approved v1', () => {
    expect(
      pickOwnerTemplate([
        { name: OWNER_ORDER_TEMPLATE, status: 'APPROVED' },
        { name: OWNER_ORDER_TEMPLATE_V2, status: 'APPROVED' },
      ]),
    ).toBe(OWNER_ORDER_TEMPLATE_V2)
    expect(
      pickOwnerTemplate([
        { name: OWNER_ORDER_TEMPLATE, status: 'APPROVED' },
        { name: OWNER_ORDER_TEMPLATE_V2, status: 'PENDING' },
      ]),
    ).toBe(OWNER_ORDER_TEMPLATE)
    expect(pickOwnerTemplate([{ name: OWNER_ORDER_TEMPLATE, status: 'PENDING' }])).toBeNull()
  })
})

describe('ownerOrderAlertParams', () => {
  it('fills every template variable with order details', () => {
    expect(ownerOrderAlertParams(order1017)).toEqual([
      'DP/26/1017',
      'Sudha Balachandran',
      '+91 98215 14956',
      'Gunda Keri | Lasode ka Achar (250 g) × 1, Gor Keri | Jaggery Mango Achar (250 g) × 1',
      '₹718.20',
      'Paid online',
      'Sai Villa, 20 Union Park, Sion Trombay Road,, Chembur, Mumbai, Maharashtra 400071',
    ])
  })

  it('labels COD and never sends empty or multi-line values', () => {
    const params = ownerOrderAlertParams({
      order_number: 1020,
      gateway: 'Cash on Delivery (COD)',
      total_price: '499',
      shipping_address: { address1: 'Flat 2\nTower B', city: 'Pune' },
    })
    expect(params[0]).toBe('#1020')
    expect(params[5]).toBe('Cash on Delivery')
    expect(params[6]).toBe('Flat 2 Tower B, Pune')
    for (const p of params) {
      expect(p.length).toBeGreaterThan(0)
      expect(p).not.toMatch(/[\n\t]| {4,}/)
    }
  })

  it('uses the webhook contact when the payload has no name or phone', () => {
    const params = ownerOrderAlertParams(
      { name: '#1021', total_price: '100' },
      { customerName: 'Asha', phone: '9820012345' },
    )
    expect(params.slice(1, 3)).toEqual(['Asha', '+91 98200 12345'])
  })
})

describe('owner template', () => {
  it('has one sample per variable and does not start or end with a variable', () => {
    for (const [body, sample] of [
      [OWNER_ORDER_TEMPLATE_BODY, OWNER_ORDER_TEMPLATE_SAMPLE],
      [OWNER_ORDER_TEMPLATE_V2_BODY, OWNER_ORDER_TEMPLATE_V2_SAMPLE],
    ] as const) {
      const vars = body.match(/\{\{\d+\}\}/g) ?? []
      expect(vars).toHaveLength(sample.length)
      expect(body.trim().startsWith('{{')).toBe(false)
      expect(body.trim().endsWith('}}')).toBe(false)
    }
    expect(OWNER_ORDER_TEMPLATE_V2_SAMPLE[0]).toBe('Vidhi')
  })
})
