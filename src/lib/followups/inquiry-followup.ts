/**
 * Automatic WhatsApp drip for inbox inquirers who never purchased.
 *
 * Enrollment: cron finds conversations where the customer went quiet
 * (no inbound for SILENCE_HOURS) but messaged within LOOKBACK_DAYS,
 * has no Shopify order, and is not already in another recovery drip.
 * Sends use the inquiry_no_purchase sequence (festival → browse → cart step2).
 * Stops when they place any order; new inbound defers the next send.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { clampToIstSendWindow } from '@/lib/shopify/send-window'
import { hasWhatsAppPhone } from '@/lib/whatsapp/phone-utils'

export const INQUIRY_TRIGGER = 'inquiry_no_purchase' as const
export const INQUIRY_SEQUENCE_NAME = 'Inquiry No-Purchase Follow-up'

/** Wait this long after the last customer message before starting the drip. */
export const INQUIRY_SILENCE_HOURS = 4
/** Only consider conversations active within this many days. */
export const INQUIRY_LOOKBACK_DAYS = 7
/** Defer an in-flight drip this many hours after a new inbound. */
export const INQUIRY_DEFER_HOURS = 4
/** Max enrollments per cron tick (keeps Meta/Hostinger load bounded). */
export const INQUIRY_ENROLL_BATCH = 40

const DEFAULT_PRODUCT = 'handmade pickles'
const STORE_HOST = /divyaprabhafoods\.com/i
const PRODUCT_PATH = /\/products\/([a-z0-9-]+)/i

export type InquiryEligibility = {
  eligible: boolean
  reason?: string
}

export function inquirySilenceElapsed(
  lastCustomerMessageAt: Date | string | null | undefined,
  now: Date = new Date(),
  silenceHours: number = INQUIRY_SILENCE_HOURS,
): boolean {
  if (!lastCustomerMessageAt) return false
  const t = new Date(lastCustomerMessageAt).getTime()
  if (!Number.isFinite(t)) return false
  return now.getTime() - t >= silenceHours * 60 * 60 * 1000
}

export function inquiryWithinLookback(
  lastCustomerMessageAt: Date | string | null | undefined,
  now: Date = new Date(),
  lookbackDays: number = INQUIRY_LOOKBACK_DAYS,
): boolean {
  if (!lastCustomerMessageAt) return false
  const t = new Date(lastCustomerMessageAt).getTime()
  if (!Number.isFinite(t)) return false
  return now.getTime() - t <= lookbackDays * 24 * 60 * 60 * 1000
}

export function evaluateInquiryEligibility(opts: {
  lastCustomerMessageAt: Date | string | null | undefined
  hasPhone: boolean
  hasOrder: boolean
  optedOut: boolean
  alreadyInInquiryDrip: boolean
  inOtherRecoveryDrip: boolean
  now?: Date
}): InquiryEligibility {
  if (!opts.hasPhone) return { eligible: false, reason: 'no_phone' }
  if (opts.optedOut) return { eligible: false, reason: 'opted_out' }
  if (opts.hasOrder) return { eligible: false, reason: 'already_purchased' }
  if (opts.alreadyInInquiryDrip) return { eligible: false, reason: 'already_enrolled' }
  if (opts.inOtherRecoveryDrip) return { eligible: false, reason: 'other_drip_active' }
  const now = opts.now ?? new Date()
  if (!inquiryWithinLookback(opts.lastCustomerMessageAt, now)) {
    return { eligible: false, reason: 'outside_lookback' }
  }
  if (!inquirySilenceElapsed(opts.lastCustomerMessageAt, now)) {
    return { eligible: false, reason: 'still_active' }
  }
  return { eligible: true }
}

/** Pull a product title / URL from recent chat text (agent links or names). */
export function extractProductHintFromTexts(texts: string[]): {
  product_title: string
  product_url?: string
} {
  for (const raw of texts) {
    const text = String(raw || '')
    const urlMatch = text.match(
      new RegExp(`https?://(?:www\\.)?${STORE_HOST.source}[^\\s)]*`, 'i'),
    )
    if (urlMatch) {
      const url = urlMatch[0].replace(/[.,;!?)]+$/, '')
      const handle = url.match(PRODUCT_PATH)?.[1]
      if (handle) {
        const title = handle
          .split('-')
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
        return { product_title: title || DEFAULT_PRODUCT, product_url: url }
      }
      if (STORE_HOST.test(url)) {
        return { product_title: DEFAULT_PRODUCT, product_url: url }
      }
    }
  }
  // Soft match common pickle names mentioned in chat
  for (const raw of texts) {
    const lower = String(raw || '').toLowerCase()
    if (lower.includes('gorkeri') || lower.includes('gor keri')) {
      return { product_title: 'Gor Keri' }
    }
    if (lower.includes('mango') && lower.includes('pickle')) {
      return { product_title: 'Homemade Mango Pickle' }
    }
    if (lower.includes('special mango')) {
      return { product_title: 'Special mango less spicy' }
    }
  }
  return { product_title: DEFAULT_PRODUCT }
}

export function deferInquirySendAt(
  from: Date = new Date(),
  deferHours: number = INQUIRY_DEFER_HOURS,
): Date {
  return clampToIstSendWindow(new Date(from.getTime() + deferHours * 60 * 60 * 1000))
}

async function lastCustomerMessageAt(
  db: SupabaseClient,
  conversationId: string,
): Promise<string | null> {
  const { data } = await db
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.created_at ?? null
}

async function recentMessageTexts(
  db: SupabaseClient,
  conversationId: string,
  limit = 30,
): Promise<string[]> {
  const { data } = await db
    .from('messages')
    .select('content_text')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((m) => String(m.content_text || '')).filter(Boolean)
}

/**
 * Push next_send_at forward when the customer messages again mid-drip
 * so we do not nag during an active chat.
 */
export async function deferInquiryFollowupOnInbound(
  db: SupabaseClient,
  contactId: string,
): Promise<boolean> {
  const { data: sequences } = await db
    .from('shopify_automation_sequences')
    .select('id')
    .eq('trigger_type', INQUIRY_TRIGGER)
  const seqIds = (sequences ?? []).map((s) => s.id)
  if (seqIds.length === 0) return false

  const nextSend = deferInquirySendAt().toISOString()
  const { data } = await db
    .from('shopify_recovery_tracking')
    .update({
      next_send_at: nextSend,
      updated_at: new Date().toISOString(),
    })
    .eq('contact_id', contactId)
    .eq('status', 'in_progress')
    .in('sequence_id', seqIds)
    .select('id')

  return (data?.length ?? 0) > 0
}

/**
 * Scan recent conversations and enroll eligible no-purchase inquirers.
 */
export async function enrollInquiryFollowups(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<{ scanned: number; enrolled: number; skipped: number }> {
  const lookbackStart = new Date(
    now.getTime() - INQUIRY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  // Do not filter on conversation.last_message_at silence — an agent reply
  // after the customer goes quiet would otherwise hide eligible leads.
  // Silence is measured on the last *customer* message below.
  const { data: conversations, error } = await db
    .from('conversations')
    .select('id, account_id, contact_id, last_message_at')
    .not('contact_id', 'is', null)
    .gte('last_message_at', lookbackStart)
    .order('last_message_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[inquiry-followup] conversation scan failed:', error.message)
    return { scanned: 0, enrolled: 0, skipped: 0 }
  }

  let scanned = 0
  let enrolled = 0
  let skipped = 0

  for (const conv of conversations ?? []) {
    if (enrolled >= INQUIRY_ENROLL_BATCH) break
    if (!conv.contact_id || !conv.account_id) continue
    scanned++

    const lastInbound = await lastCustomerMessageAt(db, conv.id)
    const { data: contact } = await db
      .from('contacts')
      .select('id, phone, name, marketing_opt_out_at, marketing_opt_in, whatsapp_marketing_opt_in')
      .eq('id', conv.contact_id)
      .maybeSingle()

    const { data: order } = await db
      .from('shopify_orders')
      .select('id')
      .eq('contact_id', conv.contact_id)
      .limit(1)
      .maybeSingle()

    const { data: inquirySeq } = await db
      .from('shopify_automation_sequences')
      .select('id, is_active')
      .eq('account_id', conv.account_id)
      .eq('trigger_type', INQUIRY_TRIGGER)
      .maybeSingle()

    if (!inquirySeq?.id || !inquirySeq.is_active) {
      skipped++
      continue
    }

    const { data: existingInquiry } = await db
      .from('shopify_recovery_tracking')
      .select('id')
      .eq('contact_id', conv.contact_id)
      .eq('sequence_id', inquirySeq.id)
      .eq('status', 'in_progress')
      .limit(1)
      .maybeSingle()

    const { data: otherDrip } = await db
      .from('shopify_recovery_tracking')
      .select('id')
      .eq('contact_id', conv.contact_id)
      .eq('status', 'in_progress')
      .neq('sequence_id', inquirySeq.id)
      .limit(1)
      .maybeSingle()

    const decision = evaluateInquiryEligibility({
      lastCustomerMessageAt: lastInbound,
      hasPhone: hasWhatsAppPhone(contact?.phone),
      hasOrder: !!order,
      optedOut: !!contact?.marketing_opt_out_at,
      alreadyInInquiryDrip: !!existingInquiry,
      inOtherRecoveryDrip: !!otherDrip,
      now,
    })

    if (!decision.eligible) {
      skipped++
      continue
    }

    // Engaged inbox lead: they messaged us. Ensure marketing send is allowed
    // unless they explicitly opted out (already filtered above).
    if (
      contact &&
      contact.marketing_opt_in !== true &&
      contact.whatsapp_marketing_opt_in !== true
    ) {
      await db
        .from('contacts')
        .update({
          whatsapp_marketing_opt_in: true,
          marketing_opt_in: true,
          marketing_opt_in_source: 'inbox_inquiry',
          marketing_opt_in_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', contact.id)
        .is('marketing_opt_out_at', null)
    }

    const texts = await recentMessageTexts(db, conv.id)
    const hint = extractProductHintFromTexts(texts)
    const firstSendAt = clampToIstSendWindow(now).toISOString()

    const { error: insErr } = await db.from('shopify_recovery_tracking').insert({
      account_id: conv.account_id,
      contact_id: conv.contact_id,
      sequence_id: inquirySeq.id,
      current_step: 1,
      status: 'in_progress',
      next_send_at: firstSendAt,
      metadata: {
        source: 'inquiry_no_purchase',
        product_title: hint.product_title,
        product_url: hint.product_url || null,
        enrolled_at: now.toISOString(),
        last_customer_message_at: lastInbound,
      },
    })

    if (insErr) {
      if (insErr.code !== '23505') {
        console.error('[inquiry-followup] enroll failed:', insErr.message)
      }
      skipped++
      continue
    }
    enrolled++
  }

  return { scanned, enrolled, skipped }
}

export async function runInquiryFollowupEnrollmentCron(): Promise<Response> {
  const { supabaseAdmin } = await import('@/lib/automations/admin-client')
  const result = await enrollInquiryFollowups(supabaseAdmin())
  return NextResponse.json({ ok: true, ...result })
}
