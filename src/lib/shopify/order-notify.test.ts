import { describe, expect, it } from 'vitest'
import {
  extractShopifyCustomerIdentity,
  isShopifyCodOrder,
  shouldEnqueueWorkflowTemplate,
} from './order-notify'

describe('isShopifyCodOrder', () => {
  it('detects Shopify cash_on_delivery gateway', () => {
    expect(isShopifyCodOrder({ gateway: 'cash_on_delivery' })).toBe(true)
  })

  it('detects COD in payment_gateway_names', () => {
    expect(
      isShopifyCodOrder({
        gateway: 'bogus',
        payment_gateway_names: ['Cash on Delivery (COD)'],
      }),
    ).toBe(true)
  })

  it('does not treat prepaid / Razorpay as COD', () => {
    expect(
      isShopifyCodOrder({
        gateway: 'razorpay',
        payment_gateway_names: ['Razorpay'],
      }),
    ).toBe(false)
  })

  it('does not match a generic "delivery" gateway name', () => {
    expect(
      isShopifyCodOrder({
        gateway: 'manual',
        payment_gateway_names: ['Local delivery'],
      }),
    ).toBe(false)
  })
})

describe('shouldEnqueueWorkflowTemplate', () => {
  it('always sends order confirmation, including COD', () => {
    expect(shouldEnqueueWorkflowTemplate('order_confirmation', false)).toBe(true)
    expect(shouldEnqueueWorkflowTemplate('order_confirmation', true)).toBe(true)
  })

  it('sends COD confirmation only for COD orders', () => {
    expect(shouldEnqueueWorkflowTemplate('cod_confirmation', true)).toBe(true)
    expect(shouldEnqueueWorkflowTemplate('cod_confirmation', false)).toBe(false)
  })
})

describe('extractShopifyCustomerIdentity', () => {
  it('reads phone from shipping address when order.phone is empty', () => {
    const id = extractShopifyCustomerIdentity({
      email: 'a@b.com',
      customer: { first_name: 'Riya', last_name: 'Shah' },
      shipping_address: { phone: '+91 98203 68269' },
    })
    expect(id.phone).toBe('+91 98203 68269')
    expect(id.firstName).toBe('Riya')
    expect(id.email).toBe('a@b.com')
  })

  it('reads phone from note_attributes used by custom checkouts', () => {
    const id = extractShopifyCustomerIdentity({
      email: 'a@b.com',
      note_attributes: [{ name: 'WhatsApp', value: '9769104020' }],
    })
    expect(id.phone).toBe('9769104020')
  })

  it('reads customer.default_address.phone', () => {
    const id = extractShopifyCustomerIdentity({
      customer: {
        id: 11,
        email: 'x@y.com',
        default_address: { phone: '09820368269' },
      },
    })
    expect(id.phone).toBe('09820368269')
    expect(id.customerId).toBe('11')
  })
})
