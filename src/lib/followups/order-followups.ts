import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { findOrCreateConversation } from '@/lib/inbox/find-or-create-conversation'
import { forMetaImageUrl, storefrontProductById } from '@/lib/shopify/product-image'
import {
  REFILL_FOLLOWUP_TEMPLATE,
  REFILL_REMINDER_TEMPLATE,
  REVIEW_REMINDER_TEMPLATE,
  REVIEW_REQUEST_TEMPLATE,
} from '@/lib/shopify/whatsapp-template-library'
import {
  followupProductsFromLineItems,
  initialPlan,
  isStageStale,
  joinProductNames,
  knownReviewHandle,
  newFollowupToken,
  nextPlan,
  reviewableProducts,
  unopenedReviewProducts,
  type FollowupProduct,
  type FollowupStage,
} from './plan'

const STAGE_TEMPLATE: Record<Exclude<FollowupStage, 'done'>, string> = {
  review_request: REVIEW_REQUEST_TEMPLATE,
  review_reminder: REVIEW_REMINDER_TEMPLATE,
  refill: REFILL_REMINDER_TEMPLATE,
  refill_followup: REFILL_FOLLOWUP_TEMPLATE,
}

const CLAIM_MS = 15 * 60 * 1000
const RETRY_MS = 30 * 60 * 1000
const UNAPPROVED_WAIT_MS = 60 * 60 * 1000
const MAX_ATTEMPTS = 3
const BATCH = 25

export interface OrderFollowupRow {
  id: string
  account_id: string
  contact_id: string
  shopify_order_id: string
  order_number: string | null
  order_created_at: string | null
  delivered_at: string
  token: string
  products: FollowupProduct[]
  stage: FollowupStage
  status: 'active' | 'completed' | 'cancelled'
  next_run_at: string | null
  attempts: number
  history: Array<Record<string, unknown>>
  review_opened_at: string | null
  reorder_clicked_at: string | null
}

function isDeadOrder(order: { financial_status?: string | null } | null): boolean {
  const status = String(order?.financial_status || '').toLowerCase()
  return status === 'refunded' || status === 'voided'
}

function catalogImage(product: Record<string, unknown> | null): string | null {
  const image = product?.image as { src?: unknown } | null | undefined
  const images = Array.isArray(product?.images) ? (product?.images as Array<{ src?: unknown }>) : []
  const src = image?.src || images[0]?.src
  return typeof src === 'string' && src ? forMetaImageUrl(src) : null
}

/** Products of the order with their storefront handle (review page) and image. */
export async function resolveFollowupProducts(lineItems: unknown): Promise<FollowupProduct[]> {
  const products = followupProductsFromLineItems(lineItems)
  for (const product of products) {
    const catalog = product.product_id ? await storefrontProductById(product.product_id) : null
    const handle = typeof catalog?.handle === 'string' ? catalog.handle : null
    product.handle = handle || knownReviewHandle(product.title)
    product.image_url = product.image_url || catalogImage(catalog)
  }
  return products
}

/**
 * Start the review → refill follow-ups for a delivered order. Safe to call
 * from every delivered signal (courier webhook, sweep, Shopify): one row per order.
 */
export async function scheduleOrderFollowups(
  db: SupabaseClient,
  args: { accountId: string; shopifyOrderId: string; deliveredAt?: Date; now?: Date },
): Promise<{ status: 'scheduled' | 'exists' | 'skipped'; reason?: string }> {
  try {
    const { data: existing, error: existingErr } = await db
      .from('order_followups')
      .select('id')
      .eq('account_id', args.accountId)
      .eq('shopify_order_id', args.shopifyOrderId)
      .maybeSingle()
    if (existingErr) return { status: 'skipped', reason: existingErr.message }
    if (existing) return { status: 'exists' }

    const { data: order } = await db
      .from('shopify_orders')
      .select('contact_id, order_number, line_items, financial_status, created_at')
      .eq('account_id', args.accountId)
      .eq('shopify_order_id', args.shopifyOrderId)
      .maybeSingle()
    if (!order?.contact_id) return { status: 'skipped', reason: 'no_order_contact' }
    if (isDeadOrder(order)) return { status: 'skipped', reason: 'refunded' }

    const now = args.now ?? new Date()
    const deliveredAt = args.deliveredAt && Number.isFinite(args.deliveredAt.getTime())
      ? args.deliveredAt
      : now
    const products = await resolveFollowupProducts(order.line_items)
    const plan = initialPlan(deliveredAt, now, reviewableProducts(products).length > 0)
    if (!plan || products.length === 0) return { status: 'skipped', reason: 'too_old_or_empty' }

    const { error } = await db.from('order_followups').insert({
      account_id: args.accountId,
      contact_id: order.contact_id,
      shopify_order_id: args.shopifyOrderId,
      order_number: order.order_number,
      order_created_at: order.created_at,
      delivered_at: deliveredAt.toISOString(),
      token: newFollowupToken(),
      products,
      stage: plan.stage,
      next_run_at: plan.next_run_at?.toISOString() ?? null,
    })
    if (error) {
      if (error.code === '23505') return { status: 'exists' }
      return { status: 'skipped', reason: error.message }
    }
    return { status: 'scheduled' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[order-followups] schedule failed:', message)
    return { status: 'skipped', reason: message }
  }
}

export async function loadFollowupByToken(
  db: SupabaseClient,
  token: string,
): Promise<OrderFollowupRow | null> {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(token)) return null
  const { data } = await db.from('order_followups').select('*').eq('token', token).maybeSingle()
  return (data as OrderFollowupRow | null) ?? null
}

/** The customer opened a review link (one product, or every product when `handle` is null). */
export async function markReviewOpened(
  db: SupabaseClient,
  row: OrderFollowupRow,
  handle: string | null,
): Promise<void> {
  const now = new Date().toISOString()
  const products = row.products.map((p) =>
    p.handle && (handle === null || p.handle === handle) && !p.opened_at
      ? { ...p, opened_at: now }
      : p,
  )
  await db
    .from('order_followups')
    .update({
      products,
      review_opened_at: row.review_opened_at || now,
      updated_at: now,
    })
    .eq('id', row.id)
}

export async function markReorderClicked(db: SupabaseClient, row: OrderFollowupRow): Promise<void> {
  if (row.reorder_clicked_at) return
  const now = new Date().toISOString()
  await db
    .from('order_followups')
    .update({ reorder_clicked_at: now, updated_at: now })
    .eq('id', row.id)
}

/** STOP / "Stop reminders": no more review or refill messages for this contact. */
export async function stopOrderFollowupsForContact(
  db: SupabaseClient,
  contactId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db.from('contacts').update({ reorder_reminders_off_at: now }).eq('id', contactId)
  await db
    .from('order_followups')
    .update({ status: 'cancelled', last_error: 'customer_stopped', updated_at: now })
    .eq('contact_id', contactId)
    .eq('status', 'active')
}

async function isTemplateApproved(db: SupabaseClient, accountId: string, name: string) {
  const { data } = await db
    .from('message_templates')
    .select('status')
    .eq('account_id', accountId)
    .eq('name', name)
    .limit(1)
    .maybeSingle()
  return String(data?.status || '').toUpperCase() === 'APPROVED'
}

type StageOutcome =
  | { kind: 'send'; params: string[] }
  | { kind: 'skip'; reason: string }
  | { kind: 'finish'; reason: string }

async function stageOutcome(
  db: SupabaseClient,
  row: OrderFollowupRow,
  contact: { name?: string | null; reorder_reminders_off_at?: string | null } | null,
): Promise<StageOutcome> {
  const firstName = String(contact?.name || '').split(' ')[0].trim() || 'Customer'
  const names = (products: FollowupProduct[]) => joinProductNames(products.map((p) => p.title))

  if (row.stage === 'review_request') {
    const reviewable = reviewableProducts(row.products)
    if (reviewable.length === 0) return { kind: 'skip', reason: 'no_review_page' }
    return { kind: 'send', params: [firstName, String(row.order_number || ''), names(reviewable)] }
  }
  if (row.stage === 'review_reminder') {
    const pending = unopenedReviewProducts(row.products)
    if (pending.length === 0) return { kind: 'skip', reason: 'review_links_opened' }
    return { kind: 'send', params: [firstName, names(pending)] }
  }

  if (contact?.reorder_reminders_off_at) return { kind: 'finish', reason: 'customer_stopped' }
  if (row.order_created_at) {
    const { data: newer } = await db
      .from('shopify_orders')
      .select('id')
      .eq('account_id', row.account_id)
      .eq('contact_id', row.contact_id)
      .gt('created_at', row.order_created_at)
      .limit(1)
      .maybeSingle()
    if (newer) return { kind: 'finish', reason: 'reordered' }
  }
  return { kind: 'send', params: [firstName, names(row.products)] }
}

async function advance(
  db: SupabaseClient,
  row: OrderFollowupRow,
  entry: Record<string, unknown>,
  now: Date,
  finish = false,
): Promise<void> {
  const plan = finish
    ? { stage: 'done' as const, next_run_at: null }
    : nextPlan(row.stage, new Date(row.delivered_at), now)
  await db
    .from('order_followups')
    .update({
      stage: plan.stage,
      status: plan.stage === 'done' ? 'completed' : 'active',
      next_run_at: plan.next_run_at?.toISOString() ?? null,
      attempts: 0,
      history: [...(row.history || []), { stage: row.stage, at: now.toISOString(), ...entry }],
      updated_at: now.toISOString(),
    })
    .eq('id', row.id)
}

function isPermanentError(message: string): boolean {
  return /contact has no phone|contact not found|skipped_no_consent|#131050|#132001|WhatsApp not configured/i.test(
    message,
  )
}

/** Cron: send every due review / refill message. */
export async function runOrderFollowupsCron(): Promise<Response> {
  const db = supabaseAdmin()
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: due, error } = await db
    .from('order_followups')
    .select('*, contacts(name, reorder_reminders_off_at)')
    .eq('status', 'active')
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(BATCH)
  if (error) {
    // Table missing until migration 058 runs.
    return NextResponse.json({ ok: true, skipped: error.message })
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const raw of due || []) {
    const row = raw as OrderFollowupRow & {
      contacts: { name?: string | null; reorder_reminders_off_at?: string | null } | null
    }
    if (row.stage === 'done') continue

    const { data: claimed } = await db
      .from('order_followups')
      .update({ next_run_at: new Date(now.getTime() + CLAIM_MS).toISOString() })
      .eq('id', row.id)
      .eq('status', 'active')
      .eq('stage', row.stage)
      .lte('next_run_at', nowIso)
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    const deliveredAt = new Date(row.delivered_at)
    if (isStageStale(row.stage, deliveredAt, now)) {
      await advance(db, row, { result: 'skipped', reason: 'stale' }, now)
      skipped++
      continue
    }

    const { data: order } = await db
      .from('shopify_orders')
      .select('financial_status')
      .eq('account_id', row.account_id)
      .eq('shopify_order_id', row.shopify_order_id)
      .maybeSingle()
    if (isDeadOrder(order)) {
      await db
        .from('order_followups')
        .update({ status: 'cancelled', last_error: 'order_refunded', updated_at: nowIso })
        .eq('id', row.id)
      skipped++
      continue
    }

    const outcome = await stageOutcome(db, row, row.contacts)
    if (outcome.kind !== 'send') {
      await advance(db, row, { result: 'skipped', reason: outcome.reason }, now, outcome.kind === 'finish')
      skipped++
      continue
    }

    const templateName = STAGE_TEMPLATE[row.stage]
    if (!(await isTemplateApproved(db, row.account_id, templateName))) {
      await db
        .from('order_followups')
        .update({
          next_run_at: new Date(now.getTime() + UNAPPROVED_WAIT_MS).toISOString(),
          last_error: `waiting for ${templateName} approval`,
        })
        .eq('id', row.id)
      continue
    }

    try {
      const { data: account } = await db
        .from('accounts')
        .select('owner_user_id')
        .eq('id', row.account_id)
        .single()
      const ownerUserId = account?.owner_user_id || row.account_id
      const conv = await findOrCreateConversation(db, {
        accountId: row.account_id,
        userId: ownerUserId,
        contactId: row.contact_id,
      })
      if (!conv) throw new Error('Failed to resolve conversation')

      const res = await engineSendTemplate({
        accountId: row.account_id,
        userId: ownerUserId,
        conversationId: conv.id,
        contactId: row.contact_id,
        templateName,
        params: outcome.params,
        buttonUrls: { followup_token: row.token },
        shopifyOrderId: row.shopify_order_id,
      })
      await advance(
        db,
        row,
        { result: 'sent', template: templateName, message_id: res.whatsapp_message_id },
        now,
      )
      sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[order-followups] ${row.id} ${row.stage} failed:`, message)
      const attempts = (row.attempts || 0) + 1
      if (isPermanentError(message) || attempts >= MAX_ATTEMPTS) {
        await advance(db, row, { result: 'failed', error: message }, now)
      } else {
        await db
          .from('order_followups')
          .update({
            attempts,
            last_error: message,
            next_run_at: new Date(now.getTime() + RETRY_MS).toISOString(),
            updated_at: nowIso,
          })
          .eq('id', row.id)
      }
      failed++
    }
  }

  return NextResponse.json({ ok: true, due: due?.length ?? 0, sent, skipped, failed })
}
