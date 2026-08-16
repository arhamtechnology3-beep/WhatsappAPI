import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  fetchLatestShopifyCustomers,
  fetchShopifyCollection,
} from '@/lib/shopify/shopify-client'
import { matchOrCreateShopifyContact } from '@/lib/shopify/shopify-helper'
import { mergeDuplicateContactsForAccount } from '@/lib/contacts/merge-duplicates'

export const maxDuration = 60

const CUSTOMER_PAGES = 8
const ORDER_PAGES = 4
const CHECKOUT_PAGES = 4
const UPSERT_CONCURRENCY = 8

type ShopifyRecord = Record<string, unknown>

function asString(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s || null
}

function personName(
  first?: unknown,
  last?: unknown,
  email?: string | null,
  fallback?: string
): string {
  const name = [asString(first), asString(last)].filter(Boolean).join(' ')
  if (name) return name
  if (email) {
    return email
      .split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim()
  }
  return fallback || 'Shopify Customer'
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return
  let index = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++]
      await fn(current)
    }
  })
  await Promise.all(workers)
}

export async function POST() {
  try {
    const ctx = await getCurrentAccount()
    if (!ctx.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const db = supabaseAdmin()
    const syncedIds = new Set<string>()
    const fetchWarnings: string[] = []

    let shopifyCustomers: ShopifyRecord[] = []
    try {
      const res = await fetchLatestShopifyCustomers(CUSTOMER_PAGES)
      shopifyCustomers = res.items as unknown as ShopifyRecord[]
      if (res.truncated) {
        fetchWarnings.push(`customers: synced newest ${res.items.length} (more pages remain)`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[shopify-sync] Failed to fetch customers:', err)
      fetchWarnings.push(`customers: ${msg}`)
    }

    let shopifyOrders: ShopifyRecord[] = []
    try {
      let res
      try {
        res = await fetchShopifyCollection<ShopifyRecord>(
          '/orders.json?status=any&limit=250&order=updated_at+desc',
          'orders',
          { maxPages: ORDER_PAGES }
        )
      } catch {
        res = await fetchShopifyCollection<ShopifyRecord>(
          '/orders.json?status=any&limit=250',
          'orders',
          { maxPages: ORDER_PAGES }
        )
      }
      shopifyOrders = res.items
      if (res.truncated) {
        fetchWarnings.push(`orders: synced newest ${res.items.length} (more pages remain)`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[shopify-sync] Failed to fetch /orders.json:', err)
      fetchWarnings.push(`orders: ${msg}`)
    }

    let shopifyCheckouts: ShopifyRecord[] = []
    try {
      const since = new Date()
      since.setUTCDate(since.getUTCDate() - 180)
      const res = await fetchShopifyCollection<ShopifyRecord>(
        `/checkouts.json?limit=250&updated_at_min=${encodeURIComponent(since.toISOString())}`,
        'checkouts',
        { maxPages: CHECKOUT_PAGES }
      )
      shopifyCheckouts = res.items
      if (res.truncated) {
        fetchWarnings.push(`checkouts: synced newest ${res.items.length} (more pages remain)`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[shopify-sync] Failed to fetch /checkouts.json:', err)
      fetchWarnings.push(`checkouts: ${msg}`)
    }

    const recordContact = async (payload: {
      id?: number | string | null
      email?: string | null
      phone?: string | null
      first_name?: string | null
      last_name?: string | null
      company?: string | null
      marketing_opt_in?: boolean
      nameMode?: 'replace' | 'fill'
      orders_count?: number
    }) => {
      if (!payload.phone && !payload.email && !payload.id) return null
      try {
        const contact = await matchOrCreateShopifyContact(
          db,
          ctx.accountId,
          ctx.userId,
          {
            ...payload,
            id: payload.id ?? undefined,
          }
        )
        if (contact?.id) syncedIds.add(contact.id)
        return contact
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[shopify-sync] upsert failed:', msg)
        return null
      }
    }

    await mapPool(shopifyCustomers, UPSERT_CONCURRENCY, async (sc) => {
      const addr = (sc.default_address || {}) as ShopifyRecord
      const email = asString(sc.email)
      const phone = asString(sc.phone) || asString(addr.phone)
      await recordContact({
        id: sc.id as number | string | undefined,
        email,
        phone,
        first_name: asString(sc.first_name),
        last_name: asString(sc.last_name),
        company: asString(addr.company),
        marketing_opt_in:
          sc.accepts_marketing === true ||
          (sc.sms_marketing_consent as ShopifyRecord | undefined)?.state === 'subscribed',
        nameMode: 'replace',
        orders_count: Number(sc.orders_count) || 0,
      })
    })

    await mapPool(shopifyOrders, UPSERT_CONCURRENCY, async (o) => {
      const c = (o.customer || {}) as ShopifyRecord
      const addr = ((o.shipping_address || o.billing_address || {}) as ShopifyRecord)
      const email = asString(o.email) || asString(c.email)
      const phone = asString(o.phone) || asString(addr.phone) || asString(c.phone)
      await recordContact({
        id: c.id as number | string | undefined,
        email,
        phone,
        first_name: asString(c.first_name) || asString(addr.first_name),
        last_name: asString(c.last_name) || asString(addr.last_name),
        company: asString(addr.company),
        nameMode: 'fill',
      })
    })

    await mapPool(shopifyCheckouts, UPSERT_CONCURRENCY, async (co) => {
      const addr = ((co.shipping_address || co.billing_address || {}) as ShopifyRecord)
      const customer = (co.customer || {}) as ShopifyRecord
      const email = asString(co.email) || asString(customer.email)
      const phone = asString(co.phone) || asString(addr.phone) || asString(customer.phone)
      const contact = await recordContact({
        id: (co.customer_id || customer.id) as number | string | undefined,
        email,
        phone,
        first_name: asString(addr.first_name) || asString(customer.first_name),
        last_name: asString(addr.last_name) || asString(customer.last_name),
        company: asString(addr.company),
        nameMode: 'fill',
      })

      if (!contact?.id) return

      const checkoutId = asString(co.id) || asString(co.token)
      if (!checkoutId) return

      const isCompleted = Boolean(co.completed_at)
      const { error: upsertErr } = await db.from('shopify_checkouts').upsert(
        {
          account_id: ctx.accountId,
          shopify_checkout_id: checkoutId,
          contact_id: contact.id,
          customer_phone: phone,
          customer_email: email,
          customer_name: contact.name || personName(addr.first_name, addr.last_name, email),
          cart_token: asString(co.cart_token),
          abandoned_checkout_url: asString(co.abandoned_checkout_url),
          total_price: parseFloat(String(co.total_price || '0')) || 0,
          currency: asString(co.currency) || 'INR',
          line_items: co.line_items || [],
          status: isCompleted ? 'recovered' : 'open',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'shopify_checkout_id' }
      )
      if (upsertErr) {
        console.error('[shopify-sync] checkout upsert failed:', upsertErr.message)
      }
    })

    let mergedDuplicates = 0
    try {
      mergedDuplicates = await mergeDuplicateContactsForAccount(db, ctx.accountId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[shopify-sync] duplicate merge failed:', err)
      fetchWarnings.push(`dedupe: ${msg}`)
    }

    return NextResponse.json({
      success: true,
      syncedCount: syncedIds.size,
      mergedDuplicates,
      fetched: {
        customers: shopifyCustomers.length,
        orders: shopifyOrders.length,
        checkouts: shopifyCheckouts.length,
      },
      warnings: fetchWarnings,
    })
  } catch (err: unknown) {
    console.error('[shopify-sync] sync-customers error:', err)
    return toErrorResponse(err)
  }
}
