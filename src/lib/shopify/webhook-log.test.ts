import { describe, expect, it } from 'vitest'
import { compactShopifyWebhookPayload } from './webhook-log'

describe('compactShopifyWebhookPayload', () => {
  it('stores a tiny summary by default', () => {
    const out = compactShopifyWebhookPayload('orders/create', {
      id: 123,
      email: 'a@b.com',
      phone: '919999999999',
      financial_status: 'paid',
      line_items: [{ id: 1 }, { id: 2 }],
      note: 'huge body we do not want',
    })
    expect(out._compact).toBe(true)
    expect(out.id).toBe(123)
    expect(out.email).toBe('[redacted]')
    expect(out.line_item_count).toBe(2)
    expect(out.note).toBeUndefined()
  })
})
