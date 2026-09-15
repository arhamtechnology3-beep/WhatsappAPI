import { toMetaPhone } from '@/lib/whatsapp/phone-utils'
import { fetchShopify } from '@/lib/shopify/shopify-client'

const PHONE_NOTE_KEYS = /^(phone|mobile|whatsapp|wa|contact.?number|customer.?phone)$/i

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return null
}

function noteAttributePhone(payload: Record<string, unknown>): string | null {
  const attrs = payload.note_attributes
  if (!Array.isArray(attrs)) return null
  for (const raw of attrs) {
    const row = asRecord(raw)
    if (!row) continue
    const name = String(row.name || row.key || '')
    if (!PHONE_NOTE_KEYS.test(name)) continue
    const value = firstString(row.value)
    if (value && toMetaPhone(value)) return value
  }
  return null
}

function isCodLabel(label: string): boolean {
  const s = label.toLowerCase().trim()
  if (!s) return false
  if (s === 'cod' || s === 'cash_on_delivery' || s === 'cash-on-delivery') return true
  if (s.includes('cash on delivery') || s.includes('cash_on_delivery')) return true
  // Token match so "encoding" / "local delivery" / shipping names do not flip prepaid → COD.
  return /(^|[^a-z])cod([^a-z]|$)/.test(s)
}

/**
 * True only for Cash on Delivery checkouts. Prepaid gateways that mention
 * "delivery" in a shipping or method name must not match.
 */
export function isShopifyCodOrder(payload: unknown): boolean {
  const order = asRecord(payload)
  if (!order) return false
  if (isCodLabel(String(order.gateway || ''))) return true
  const names = order.payment_gateway_names
  if (Array.isArray(names) && names.some((n) => isCodLabel(String(n)))) return true
  return false
}

/**
 * COD gets an extra confirmation template. Order confirmation still always sends.
 */
export function shouldEnqueueWorkflowTemplate(templateKey: string, isCod: boolean): boolean {
  if (templateKey === 'cod_confirmation') return isCod
  return true
}

export interface ShopifyCustomerIdentity {
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
  customerId: string | null
  acceptsMarketing: boolean
}

export function extractShopifyCustomerIdentity(payload: unknown): ShopifyCustomerIdentity {
  const order = asRecord(payload) || {}
  const customer = asRecord(order.customer)
  const billing = asRecord(order.billing_address)
  const shipping = asRecord(order.shipping_address)
  const defaultAddress = asRecord(customer?.default_address)

  const phone = firstString(
    order.phone,
    customer?.phone,
    billing?.phone,
    shipping?.phone,
    defaultAddress?.phone,
    noteAttributePhone(order),
  )

  const email = firstString(
    order.email,
    customer?.email,
    billing?.email,
    shipping?.email,
  )

  const smsConsent = asRecord(customer?.sms_marketing_consent)
  const smsState = String(smsConsent?.state || '').toLowerCase()
  const acceptsMarketing =
    smsState === 'subscribed' ||
    smsState === 'opt_in' ||
    order.buyer_accepts_marketing === true ||
    customer?.accepts_marketing === true

  return {
    email,
    phone,
    firstName: firstString(customer?.first_name, billing?.first_name, shipping?.first_name),
    lastName: firstString(customer?.last_name, billing?.last_name, shipping?.last_name),
    customerId: customer?.id != null ? String(customer.id) : null,
    acceptsMarketing,
  }
}

function phoneFromShopifyCustomer(customer: unknown): string | null {
  const row = asRecord(customer)
  if (!row) return null
  const defaultAddress = asRecord(row.default_address)
  return firstString(row.phone, defaultAddress?.phone)
}

/**
 * Shopify order webhooks often omit phone (email checkout, draft, some themes).
 * Pull it from Admin API so transactional WhatsApp still goes out.
 */
export async function recoverMissingShopifyPhone(payload: unknown): Promise<string | null> {
  const order = asRecord(payload)
  if (!order) return null
  const customer = asRecord(order.customer)
  const customerId = customer?.id != null ? String(customer.id) : null
  const orderId = order.id != null ? String(order.id) : null

  try {
    if (customerId) {
      const data = await fetchShopify(`/customers/${customerId}.json`)
      const phone = phoneFromShopifyCustomer(data?.customer)
      if (phone && toMetaPhone(phone)) return phone
    }
  } catch (err) {
    console.warn(
      '[shopify-order-notify] customer phone lookup failed:',
      err instanceof Error ? err.message : err,
    )
  }

  try {
    if (orderId) {
      const data = await fetchShopify(`/orders/${orderId}.json`)
      const recovered = extractShopifyCustomerIdentity(data?.order).phone
      if (recovered && toMetaPhone(recovered)) return recovered
    }
  } catch (err) {
    console.warn(
      '[shopify-order-notify] order phone lookup failed:',
      err instanceof Error ? err.message : err,
    )
  }

  return null
}
