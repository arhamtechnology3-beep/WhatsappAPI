/**
 * Multi-step WhatsApp drip for website DP10 / offer unlock claims who
 * never purchase. Instant free-form code reply stays in unlock-claim.ts;
 * this enrolls the marketing sequence that keeps nudging until they order.
 * Post-purchase order follow-ups are unchanged.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  shouldDeferOutsideIstWindow,
} from '@/lib/shopify/send-window'
import { hasWhatsAppPhone, toMetaPhone } from '@/lib/whatsapp/phone-utils'

export const OFFER_UNLOCK_TRIGGER = 'offer_unlock_no_purchase' as const
export const OFFER_UNLOCK_SEQUENCE_NAME = 'Offer Unlock No-Purchase Follow-up'

/** Wait after the unlock reply before the first template. */
export const OFFER_UNLOCK_FIRST_DELAY_HOURS = 4
/** Claimed unlocks older than this are still backfilled. */
export const OFFER_UNLOCK_LOOKBACK_DAYS = 21
/** Max new enrollments per cron tick. */
export const OFFER_UNLOCK_ENROLL_BATCH = 25

function firstSendAtIso(now: Date, delayHours: number): string {
  const candidate = new Date(now.getTime() + delayHours * 60 * 60 * 1000)
  const windowDecision = shouldDeferOutsideIstWindow(candidate)
  return windowDecision.defer
    ? windowDecision.nextAt.toISOString()
    : candidate.toISOString()
}

export type OfferUnlockEnrollResult =
  | { ok: true; action: 'enrolled' | 'bumped' }
  | { ok: false; reason: string }

/**
 * Enroll one contact into the offer-unlock drip (or bump next_send_at).
 */
export async function enrollOfferUnlockFollowup(
  db: SupabaseClient,
  opts: {
    accountId: string
    contactId: string
    discountCode?: string
    refCode?: string
    now?: Date
    /** Hours before first template (0 = send ASAP on next sequence tick). */
    firstDelayHours?: number
    bumpIfEnrolled?: boolean
  },
): Promise<OfferUnlockEnrollResult> {
  const now = opts.now ?? new Date()
  const firstDelay =
    opts.firstDelayHours ?? OFFER_UNLOCK_FIRST_DELAY_HOURS

  const { data: contact } = await db
    .from('contacts')
    .select('id, phone, marketing_opt_out_at, marketing_opt_in, whatsapp_marketing_opt_in')
    .eq('id', opts.contactId)
    .maybeSingle()

  if (!contact?.id || !hasWhatsAppPhone(contact.phone)) {
    return { ok: false, reason: 'no_phone' }
  }
  if (contact.marketing_opt_out_at) {
    return { ok: false, reason: 'opted_out' }
  }

  const { data: order } = await db
    .from('shopify_orders')
    .select('id')
    .eq('contact_id', opts.contactId)
    .limit(1)
    .maybeSingle()
  if (order) return { ok: false, reason: 'already_purchased' }

  const { data: sequence } = await db
    .from('shopify_automation_sequences')
    .select('id, is_active')
    .eq('account_id', opts.accountId)
    .eq('trigger_type', OFFER_UNLOCK_TRIGGER)
    .maybeSingle()

  if (!sequence?.id || !sequence.is_active) {
    return { ok: false, reason: 'sequence_inactive' }
  }

  const { data: existing } = await db
    .from('shopify_recovery_tracking')
    .select('id')
    .eq('contact_id', opts.contactId)
    .eq('sequence_id', sequence.id)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle()

  const nextSend = firstSendAtIso(now, firstDelay)

  if (existing?.id) {
    if (opts.bumpIfEnrolled) {
      await db
        .from('shopify_recovery_tracking')
        .update({
          next_send_at: firstSendAtIso(now, 0),
          updated_at: now.toISOString(),
          metadata: {
            source: 'wa_unlock_popup',
            discount_code: opts.discountCode || 'DP10',
            ref_code: opts.refCode || null,
            bumped_at: now.toISOString(),
          },
        })
        .eq('id', existing.id)
      return { ok: true, action: 'bumped' }
    }
    return { ok: false, reason: 'already_enrolled' }
  }

  const { data: otherDrip } = await db
    .from('shopify_recovery_tracking')
    .select('id')
    .eq('contact_id', opts.contactId)
    .eq('status', 'in_progress')
    .neq('sequence_id', sequence.id)
    .limit(1)
    .maybeSingle()
  if (otherDrip) return { ok: false, reason: 'other_drip_active' }

  if (
    contact.marketing_opt_in !== true &&
    contact.whatsapp_marketing_opt_in !== true
  ) {
    await db
      .from('contacts')
      .update({
        whatsapp_marketing_opt_in: true,
        marketing_opt_in: true,
        marketing_opt_in_source: 'wa_unlock_popup',
        marketing_opt_in_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', contact.id)
      .is('marketing_opt_out_at', null)
  }

  const { error } = await db.from('shopify_recovery_tracking').insert({
    account_id: opts.accountId,
    contact_id: opts.contactId,
    sequence_id: sequence.id,
    current_step: 1,
    status: 'in_progress',
    next_send_at: nextSend,
    discount_code: opts.discountCode || 'DP10',
    metadata: {
      source: 'wa_unlock_popup',
      discount_code: opts.discountCode || 'DP10',
      ref_code: opts.refCode || null,
      product_title: 'handmade pickles',
      enrolled_at: now.toISOString(),
    },
  })

  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'already_enrolled' }
    console.error('[offer-unlock-followup] enroll failed:', error.message)
    return { ok: false, reason: error.message }
  }
  return { ok: true, action: 'enrolled' }
}

/**
 * Backfill claimed unlocks who never ordered and are not in a drip.
 */
export async function enrollOfferUnlockBacklog(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<{ scanned: number; enrolled: number; skipped: number }> {
  const lookbackStart = new Date(
    now.getTime() - OFFER_UNLOCK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data: claims, error } = await db
    .from('wa_unlock_requests')
    .select('id, contact_id, organization_id, claimed_at, ref_code')
    .not('claimed_at', 'is', null)
    .not('contact_id', 'is', null)
    .gte('claimed_at', lookbackStart)
    .order('claimed_at', { ascending: true })
    .limit(200)

  if (error) {
    console.error('[offer-unlock-followup] backlog scan failed:', error.message)
    return { scanned: 0, enrolled: 0, skipped: 0 }
  }

  let scanned = 0
  let enrolled = 0
  let skipped = 0

  for (const claim of claims ?? []) {
    if (enrolled >= OFFER_UNLOCK_ENROLL_BATCH) break
    if (!claim.contact_id) continue
    scanned++

    // organization_id is the workspace; map to WhatsApp account via stores
    // when needed. Unlock webhook uses the WhatsApp account_id directly —
    // prefer contact.account_id.
    const { data: contact } = await db
      .from('contacts')
      .select('id, account_id')
      .eq('id', claim.contact_id)
      .maybeSingle()

    const accountId = contact?.account_id
    if (!accountId) {
      skipped++
      continue
    }

    const result = await enrollOfferUnlockFollowup(db, {
      accountId,
      contactId: claim.contact_id,
      refCode: claim.ref_code,
      now,
      // Backlog: send on next tick, do not wait another 4h.
      firstDelayHours: 0,
    })

    if (result.ok && result.action === 'enrolled') enrolled++
    else skipped++
  }

  return { scanned, enrolled, skipped }
}

/**
 * Ops: force enroll / bump by phone list (e.g. Swapna).
 */
export async function enrollOfferUnlockByPhones(
  db: SupabaseClient,
  phones: string[],
  now: Date = new Date(),
): Promise<{
  enrolled: number
  bumped: number
  results: Array<{ phone: string; ok: boolean; action?: string; reason?: string }>
}> {
  const targets = [
    ...new Set(
      phones.map((p) => toMetaPhone(p)).filter((p) => p.length >= 10),
    ),
  ]

  const results: Array<{
    phone: string
    ok: boolean
    action?: string
    reason?: string
  }> = []
  let enrolled = 0
  let bumped = 0

  for (const phone of targets) {
    const last10 = phone.slice(-10)
    const { data: contacts } = await db
      .from('contacts')
      .select('id, phone, account_id')
      .or(`phone.eq.${phone},phone.eq.+${phone},phone.like.%${last10}`)
      .limit(20)

    const contact = (contacts ?? []).find((c) => toMetaPhone(c.phone) === phone)
    if (!contact?.id || !contact.account_id) {
      results.push({ phone, ok: false, reason: 'contact_not_found' })
      continue
    }

    const result = await enrollOfferUnlockFollowup(db, {
      accountId: contact.account_id,
      contactId: contact.id,
      now,
      firstDelayHours: 0,
      bumpIfEnrolled: true,
    })

    if (result.ok) {
      if (result.action === 'enrolled') enrolled++
      if (result.action === 'bumped') bumped++
      results.push({ phone, ok: true, action: result.action })
    } else {
      results.push({ phone, ok: false, reason: result.reason })
    }
  }

  return { enrolled, bumped, results }
}

export async function runOfferUnlockEnrollmentCron(): Promise<Response> {
  const { supabaseAdmin } = await import('@/lib/automations/admin-client')
  const result = await enrollOfferUnlockBacklog(supabaseAdmin())
  return NextResponse.json({ ok: true, ...result })
}
