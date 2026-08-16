import { fetchShopify } from '@/lib/shopify/shopify-client'
import { normalizePhone, toMetaPhone } from '@/lib/whatsapp/phone-utils'

export type ShopifyCustomerHit = {
  id: number | string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  orders_count?: number
  total_spent?: string
}

export function isWeakContactName(
  name?: string | null,
  phone?: string | null,
): boolean {
  const n = (name || '').trim()
  if (!n) return true
  if (/^shopify customer$/i.test(n)) return true
  if (phone && normalizePhone(n) && normalizePhone(n) === normalizePhone(phone)) {
    return true
  }
  return false
}

export function shouldReplaceContactName(args: {
  existingName?: string | null
  incomingName?: string | null
  mode: 'replace' | 'fill'
  phone?: string | null
}): boolean {
  const incoming = args.incomingName?.trim()
  if (!incoming || incoming === 'Shopify Customer') return false
  if (args.mode === 'replace') return true
  return isWeakContactName(args.existingName, args.phone)
}

/** Shopify search queries for one Indian/E.164 mobile (duplicates caused 422 + a second customer). */
export function shopifyCustomerSearchQueries(
  phone?: string | null,
  email?: string | null,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (q: string) => {
    if (!seen.has(q)) {
      seen.add(q)
      out.push(q)
    }
  }

  const digits = normalizePhone(phone || '')
  const meta = phone ? toMetaPhone(phone) : ''
  const last10 = digits.length >= 10 ? digits.slice(-10) : ''

  if (meta) {
    push(`phone:${meta}`)
    push(`phone:+${meta}`)
  }
  if (last10) {
    push(`phone:${last10}`)
    push(`phone:+91${last10}`)
  }
  if (digits && digits !== meta && digits !== last10) {
    push(`phone:${digits}`)
  }
  const em = email?.trim().toLowerCase()
  if (em) push(`email:${em}`)
  return out
}

export function pickPreferredShopifyCustomer(
  customers: ShopifyCustomerHit[],
): ShopifyCustomerHit | null {
  if (customers.length === 0) return null
  return [...customers].sort((a, b) => {
    const orders = (Number(b.orders_count) || 0) - (Number(a.orders_count) || 0)
    if (orders) return orders
    const emailScore = (b.email ? 1 : 0) - (a.email ? 1 : 0)
    if (emailScore) return emailScore
    return String(b.id).localeCompare(String(a.id))
  })[0]
}

export async function searchShopifyCustomers(args: {
  phone?: string | null
  email?: string | null
}): Promise<ShopifyCustomerHit[]> {
  const byId = new Map<string, ShopifyCustomerHit>()
  for (const query of shopifyCustomerSearchQueries(args.phone, args.email)) {
    try {
      const res = await fetchShopify(
        `/customers/search.json?query=${encodeURIComponent(query)}&limit=10`,
      )
      for (const row of (res.customers || []) as ShopifyCustomerHit[]) {
        if (row?.id != null) byId.set(String(row.id), row)
      }
    } catch (err) {
      console.warn('[shopify-customer-lookup] search failed:', query, err)
    }
  }
  return [...byId.values()]
}

export async function findPreferredShopifyCustomer(args: {
  phone?: string | null
  email?: string | null
}): Promise<ShopifyCustomerHit | null> {
  return pickPreferredShopifyCustomer(await searchShopifyCustomers(args))
}

/**
 * Attach a draft/COD order to an existing Shopify customer. Only creates
 * a new Admin customer when no phone/email match exists.
 */
export async function findOrCreateShopifyAdminCustomer(args: {
  phone?: string | null
  email?: string | null
  firstName?: string
  lastName?: string
}): Promise<string | number | null> {
  const existing = await findPreferredShopifyCustomer({
    phone: args.phone,
    email: args.email,
  })
  if (existing?.id) return existing.id

  if (!args.phone && !args.email) return null

  try {
    const createRes = await fetchShopify('/customers.json', {
      method: 'POST',
      body: JSON.stringify({
        customer: {
          first_name: args.firstName || 'Customer',
          last_name: args.lastName || undefined,
          phone: args.phone || undefined,
          email: args.email || undefined,
          verified_email: Boolean(args.email),
        },
      }),
    })
    if (createRes?.customer?.id) return createRes.customer.id as number
  } catch (err) {
    console.warn('[shopify-customer-lookup] create failed, re-searching:', err)
  }

  const retry = await findPreferredShopifyCustomer({
    phone: args.phone,
    email: args.email,
  })
  return retry?.id ?? null
}
