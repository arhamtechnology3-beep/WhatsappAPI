import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getShopifyAccountContext, matchOrCreateShopifyContact } from '@/lib/shopify/shopify-helper'
import { findPreferredShopifyCustomer } from '@/lib/shopify/shopify-customer-lookup'
import { applyShopifyCors, shopifyCorsPreflight } from '@/lib/shopify/cors'
import { toMetaPhone } from '@/lib/whatsapp/phone-utils'

export async function OPTIONS(request: Request) {
  return shopifyCorsPreflight(request)
}

// POST /api/shopify/capture-visitor
// Called from smart-cart.js whenever a visitor identifies themselves with their
// phone number (ID modal, address form, or Shopify customer login).
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  try {
    const body = await request.json()
    const rawPhone: string | null = body.phone ? String(body.phone) : null
    const email: string | null = body.email ? String(body.email).trim().toLowerCase() : null
    const rawName: string | null = body.name ? String(body.name).trim() : null
    const shopifyCustomerId: string | number | null = body.customer_id || body.shopify_customer_id || null

    if (!rawPhone && !email && !shopifyCustomerId) {
      const res = NextResponse.json({ success: false, error: 'phone or email required' }, { status: 400 })
      applyShopifyCors(res, origin)
      return res
    }

    const supabase = supabaseAdmin()
    const { accountId, userId } = await getShopifyAccountContext(supabase)
    const phone = rawPhone ? toMetaPhone(rawPhone) : null

    let resolvedShopifyId = shopifyCustomerId ? String(shopifyCustomerId) : null
    let ordersCount = 0
    if (phone || email) {
      try {
        const found = await findPreferredShopifyCustomer({ phone, email })
        if (found?.id) {
          const foundOrders = Number(found.orders_count) || 0
          if (!resolvedShopifyId || foundOrders > 0) {
            resolvedShopifyId = String(found.id)
            ordersCount = foundOrders
          }
        }
      } catch (err) {
        console.warn('[capture-visitor] Shopify customer search failed:', err)
      }
    }

    const nameParts = (rawName || '').split(/\s+/).filter(Boolean)
    const contact = await matchOrCreateShopifyContact(supabase, accountId, userId, {
      id: resolvedShopifyId || undefined,
      email,
      phone,
      first_name: nameParts[0] || null,
      last_name: nameParts.slice(1).join(' ') || null,
      nameMode: 'fill',
      orders_count: ordersCount,
    })

    if (!contact) {
      const res = NextResponse.json({ success: false, error: 'Could not save contact' }, { status: 400 })
      applyShopifyCors(res, origin)
      return res
    }

    const res = NextResponse.json({
      success: true,
      action: contact.shopify_customer_id ? 'synced' : 'saved',
      contact_id: contact.id,
    })
    applyShopifyCors(res, origin)
    return res
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    console.error('[capture-visitor] error:', err)
    const res = NextResponse.json({ success: false, error: message }, { status: 500 })
    applyShopifyCors(res, origin)
    return res
  }
}
