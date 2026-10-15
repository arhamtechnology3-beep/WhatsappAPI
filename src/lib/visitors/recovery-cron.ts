import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { initializeCheckoutRecoverySequence } from '@/lib/shopify/shopify-helper'
import { isInsideIstSendWindow, clampToIstSendWindow } from '@/lib/shopify/send-window'
import { toCustomerStoreUrl } from '@/lib/shopify/storefront-url'
import {
  COLLECTION_ALL_PRODUCTS_PATH,
  storefrontBaseUrl,
} from '@/lib/shopify/whatsapp-template-library'
import { hasWhatsAppPhone } from '@/lib/whatsapp/phone-utils'
import { canSendMarketing } from '@/lib/whatsapp/opt-in-helper'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { findOrCreateConversation } from '@/lib/inbox/find-or-create-conversation'
import { getOrCreateCaptureSettings } from '@/lib/visitors/capture-settings'
import { ensureContactLinkToken } from '@/lib/visitors/tokens'

export type NudgeType = 'cart' | 'browse' | 'visit'

type SessionRow = {
  id: string
  visitor_id: string
  session_id: string
  store_id: string
  organization_id: string
  products_viewed: unknown
  cart_events: unknown
  last_activity_at: string | null
  session_start: string
}

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : []
}

export function classifyNudge(session: {
  products_viewed?: unknown
  cart_events?: unknown
}): NudgeType {
  const cart = asArray(session.cart_events)
  const products = asArray(session.products_viewed)
  const hasCart = cart.some(
    (e) => e?.type === 'add_to_cart' || e?.type === 'checkout_started',
  )
  if (hasCart) return 'cart'
  if (products.length > 0) return 'browse'
  return 'visit'
}

export function mostViewedProduct(products_viewed: unknown): {
  product_id?: string
  handle?: string
  title?: string
  price?: string | number
  variant_id?: string
} | null {
  const products = asArray(products_viewed)
  if (!products.length) return null
  const counts = new Map<string, { count: number; row: any }>()
  for (const p of products) {
    const key = String(p.product_id || p.handle || p.title || '')
    if (!key) continue
    const prev = counts.get(key)
    counts.set(key, { count: (prev?.count || 0) + 1, row: p })
  }
  let best: { count: number; row: any } | null = null
  for (const v of counts.values()) {
    if (!best || v.count > best.count) best = v
  }
  return best?.row || products[products.length - 1] || null
}

export function cartPermalinkFromEvents(cart_events: unknown): string | null {
  const cart = asArray(cart_events).filter((e) => e?.type === 'add_to_cart')
  if (!cart.length) return null
  const qty = new Map<string, number>()
  for (const e of cart) {
    const vid = e.variant_id ? String(e.variant_id) : ''
    if (!vid) continue
    qty.set(vid, (qty.get(vid) || 0) + (Number(e.quantity) || 1))
  }
  if (!qty.size) return null
  const parts = [...qty.entries()].map(([id, q]) => `${id}:${q}`)
  return `${storefrontBaseUrl()}/cart/${parts.join(',')}`
}

async function recentOrderExists(
  supabase: SupabaseClient,
  contactId: string,
  days: number,
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - days * 86400000).toISOString()
  const { data } = await supabase
    .from('shopify_orders')
    .select('id')
    .eq('contact_id', contactId)
    .gte('created_at', since)
    .limit(1)
    .maybeSingle()
  return !!data
}

async function hasActiveRecovery(
  supabase: SupabaseClient,
  contactId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('shopify_recovery_tracking')
    .select('id')
    .eq('contact_id', contactId)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle()
  return !!data
}

async function frequencyBlocked(
  supabase: SupabaseClient,
  opts: {
    contactId: string
    nudgeType: NudgeType
    maxPer24h: number
    browseVisitCooldownDays: number
    now: Date
  },
): Promise<boolean> {
  const dayAgo = new Date(opts.now.getTime() - 86400000).toISOString()
  const { data: recent } = await supabase
    .from('visitor_nudge_log')
    .select('id, nudge_type, sent_at')
    .eq('contact_id', opts.contactId)
    .gte('sent_at', dayAgo)

  if ((recent?.length || 0) >= opts.maxPer24h) return true

  if (opts.nudgeType === 'browse' || opts.nudgeType === 'visit') {
    const cooldown = new Date(
      opts.now.getTime() - opts.browseVisitCooldownDays * 86400000,
    ).toISOString()
    const { data: soft } = await supabase
      .from('visitor_nudge_log')
      .select('id')
      .eq('contact_id', opts.contactId)
      .in('nudge_type', ['browse', 'visit'])
      .gte('sent_at', cooldown)
      .limit(1)
      .maybeSingle()
    if (soft) return true
  }
  return false
}

async function logNudge(
  supabase: SupabaseClient,
  opts: {
    storeId: string
    organizationId: string
    accountId: string
    contactId: string
    visitorId: string
    nudgeType: NudgeType
    metadata?: Record<string, unknown>
  },
) {
  await supabase.from('visitor_nudge_log').insert({
    store_id: opts.storeId,
    organization_id: opts.organizationId,
    account_id: opts.accountId,
    contact_id: opts.contactId,
    visitor_id: opts.visitorId,
    nudge_type: opts.nudgeType,
    metadata: opts.metadata || {},
  })
}

async function startBrowseRecovery(
  supabase: SupabaseClient,
  opts: {
    accountId: string
    contactId: string
    product: NonNullable<ReturnType<typeof mostViewedProduct>>
  },
): Promise<boolean> {
  const { data: activeSeq } = await supabase
    .from('shopify_recovery_tracking')
    .select('id')
    .eq('contact_id', opts.contactId)
    .eq('status', 'in_progress')
    .maybeSingle()
  if (activeSeq) return false

  const { data: sequence } = await supabase
    .from('shopify_automation_sequences')
    .select('id, is_active')
    .eq('account_id', opts.accountId)
    .eq('trigger_type', 'browse_abandoned')
    .eq('is_active', true)
    .maybeSingle()
  if (!sequence) return false

  const { data: step } = await supabase
    .from('shopify_automation_sequence_steps')
    .select('id, delay_minutes_from_previous_step, meta_approval_status, is_active')
    .eq('sequence_id', sequence.id)
    .eq('step_order', 1)
    .eq('is_active', true)
    .eq('meta_approval_status', 'approved')
    .maybeSingle()
  if (!step) return false

  // Fire soon — the inactivity window already waited 60–120 minutes.
  const nextSendAt = clampToIstSendWindow(new Date()).toISOString()
  const productUrl = opts.product.handle
    ? `${storefrontBaseUrl()}/products/${opts.product.handle}`
    : undefined

  await supabase.from('shopify_recovery_tracking').insert({
    account_id: opts.accountId,
    contact_id: opts.contactId,
    sequence_id: sequence.id,
    current_step: 1,
    status: 'in_progress',
    next_send_at: nextSendAt,
    metadata: {
      product_id: opts.product.product_id,
      product_title: opts.product.title,
      price: opts.product.price != null ? String(opts.product.price) : undefined,
      product_url: productUrl ? toCustomerStoreUrl(productUrl) : undefined,
      source: 'visitor_recognition',
    },
  })
  return true
}

async function startCartRecovery(
  supabase: SupabaseClient,
  opts: {
    accountId: string
    contactId: string
    visitorId: string
    cartUrl: string
    lineItems: unknown[]
    phone: string
  },
): Promise<boolean> {
  const checkoutId = `visitor_${opts.visitorId}_${Date.now()}`
  await supabase.from('shopify_checkouts').upsert(
    {
      account_id: opts.accountId,
      shopify_checkout_id: checkoutId,
      contact_id: opts.contactId,
      customer_phone: opts.phone,
      cart_token: checkoutId,
      abandoned_checkout_url: opts.cartUrl,
      total_price: 0,
      currency: 'INR',
      line_items: opts.lineItems,
      status: 'open',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'shopify_checkout_id' },
  )

  await initializeCheckoutRecoverySequence(
    supabase,
    opts.accountId,
    opts.contactId,
    checkoutId,
    new Date().toISOString(),
  )
  return true
}

async function sendVisitNudge(
  supabase: SupabaseClient,
  opts: {
    accountId: string
    contactId: string
    contactName: string | null
    storeId: string
    organizationId: string
  },
): Promise<boolean> {
  const { data: account } = await supabase
    .from('accounts')
    .select('owner_user_id')
    .eq('id', opts.accountId)
    .maybeSingle()
  const userId = account?.owner_user_id || opts.accountId

  const conv = await findOrCreateConversation(supabase, {
    accountId: opts.accountId,
    userId,
    contactId: opts.contactId,
  })
  if (!conv) return false

  const firstName = (opts.contactName || 'Customer').split(/\s+/)[0] || 'Customer'
  const wcid = await ensureContactLinkToken(supabase, {
    storeId: opts.storeId,
    organizationId: opts.organizationId,
    accountId: opts.accountId,
    contactId: opts.contactId,
  })

  await engineSendTemplate({
    accountId: opts.accountId,
    userId,
    conversationId: conv.id,
    contactId: opts.contactId,
    templateName: 'wacrm_visit_nudge_v1',
    params: [firstName],
    buttonUrls: {
      product_url: `${storefrontBaseUrl()}/${COLLECTION_ALL_PRODUCTS_PATH}${
        wcid ? `?wcid=${encodeURIComponent(wcid)}` : ''
      }`,
    },
  })
  return true
}

/**
 * Evaluate identified visitors whose last activity fell in the
 * inactivity window and start the appropriate WhatsApp nudge.
 */
export async function runVisitorRecoveryCron(
  now = new Date(),
): Promise<Response> {
  const supabase = supabaseAdmin()

  if (!isInsideIstSendWindow(now)) {
    return NextResponse.json({
      ok: true,
      skipped: 'outside_send_window',
      processed: 0,
    })
  }

  const { data: stores } = await supabase
    .from('stores')
    .select('id, organization_id, status')
    .eq('status', 'active')

  let processed = 0
  let cart = 0
  let browse = 0
  let visit = 0
  let skipped = 0

  for (const store of stores ?? []) {
    const settings = await getOrCreateCaptureSettings(supabase, {
      storeId: store.id,
      organizationId: store.organization_id,
    })

    const minMs = settings.inactivity_min_minutes * 60000
    const maxMs = settings.inactivity_max_minutes * 60000
    const oldest = new Date(now.getTime() - maxMs).toISOString()
    const newest = new Date(now.getTime() - minMs).toISOString()

    const { data: sessions } = await supabase
      .from('visitor_sessions')
      .select(
        'id,visitor_id,session_id,store_id,organization_id,products_viewed,cart_events,last_activity_at,session_start',
      )
      .eq('store_id', store.id)
      .gte('last_activity_at', oldest)
      .lte('last_activity_at', newest)
      .limit(100)

    for (const session of (sessions || []) as SessionRow[]) {
      const { data: identity } = await supabase
        .from('visitor_identity_map')
        .select('contact_id, phone_number')
        .eq('store_id', store.id)
        .eq('visitor_id', session.visitor_id)
        .not('contact_id', 'is', null)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!identity?.contact_id || !identity.phone_number) {
        skipped++
        continue
      }

      const contactId = identity.contact_id
      if (!hasWhatsAppPhone(identity.phone_number)) {
        skipped++
        continue
      }

      const allowed = await canSendMarketing(contactId)
      if (!allowed) {
        skipped++
        continue
      }

      if (
        await recentOrderExists(
          supabase,
          contactId,
          settings.skip_recent_buyer_days,
          now,
        )
      ) {
        skipped++
        continue
      }

      if (await hasActiveRecovery(supabase, contactId)) {
        skipped++
        continue
      }

      const nudgeType = classifyNudge(session)
      if (nudgeType === 'cart' && !settings.cart_nudge_enabled) {
        skipped++
        continue
      }
      if (nudgeType === 'browse' && !settings.browse_nudge_enabled) {
        skipped++
        continue
      }
      if (nudgeType === 'visit' && !settings.visit_nudge_enabled) {
        skipped++
        continue
      }

      if (
        await frequencyBlocked(supabase, {
          contactId,
          nudgeType,
          maxPer24h: settings.max_marketing_per_24h,
          browseVisitCooldownDays: settings.browse_visit_cooldown_days,
          now,
        })
      ) {
        skipped++
        continue
      }

      const accountId = store.organization_id
      let ok = false

      try {
        if (nudgeType === 'cart') {
          const cartUrl =
            cartPermalinkFromEvents(session.cart_events) ||
            toCustomerStoreUrl(null, `${storefrontBaseUrl()}/cart`)
          ok = await startCartRecovery(supabase, {
            accountId,
            contactId,
            visitorId: session.visitor_id,
            cartUrl,
            lineItems: asArray(session.cart_events)
              .filter((e) => e?.type === 'add_to_cart')
              .map((e) => ({
                variant_id: e.variant_id,
                product_id: e.product_id,
                title: e.title,
                quantity: e.quantity || 1,
                price: e.price,
              })),
            phone: identity.phone_number,
          })
          if (ok) cart++
        } else if (nudgeType === 'browse') {
          const product = mostViewedProduct(session.products_viewed)
          if (!product) {
            skipped++
            continue
          }
          ok = await startBrowseRecovery(supabase, {
            accountId,
            contactId,
            product,
          })
          if (ok) browse++
        } else {
          const { data: contact } = await supabase
            .from('contacts')
            .select('name')
            .eq('id', contactId)
            .maybeSingle()
          ok = await sendVisitNudge(supabase, {
            accountId,
            contactId,
            contactName: contact?.name || null,
            storeId: store.id,
            organizationId: store.organization_id,
          })
          if (ok) visit++
        }
      } catch (err) {
        console.error(
          '[visitor-recovery]',
          nudgeType,
          err instanceof Error ? err.message : err,
        )
        skipped++
        continue
      }

      if (ok) {
        await logNudge(supabase, {
          storeId: store.id,
          organizationId: store.organization_id,
          accountId,
          contactId,
          visitorId: session.visitor_id,
          nudgeType,
        })
        processed++
      } else {
        skipped++
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    cart,
    browse,
    visit,
    skipped,
  })
}
