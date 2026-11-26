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
import {
  clampToIstSendWindow,
  shouldDeferOutsideIstWindow,
} from '@/lib/shopify/send-window'
import { hasWhatsAppPhone, toMetaPhone } from '@/lib/whatsapp/phone-utils'

export const INQUIRY_TRIGGER = 'inquiry_no_purchase' as const
export const INQUIRY_SEQUENCE_NAME = 'Inquiry No-Purchase Follow-up'

/** Wait this long after the last customer message before starting the drip. */
export const INQUIRY_SILENCE_HOURS = 4
/**
 * Only consider conversations whose last activity is within this many days.
 * 14d catches the backlog after cron/template outages (7d dropped leads
 * like quiet pickle inquiries after ~a week).
 */
export const INQUIRY_LOOKBACK_DAYS = 14
/** Defer an in-flight drip this many hours after a new inbound. */
export const INQUIRY_DEFER_HOURS = 4
/** Max enrollments per cron tick (keeps Meta/Hostinger NPROC load bounded). */
export const INQUIRY_ENROLL_BATCH = 25
/**
 * Conversations to scan per tick. Newest-first used to starve quiet leads
 * (e.g. 6–7d expired pickle / offer chats) when the inbox has thousands of
 * newer threads — scan oldest-within-lookback first instead.
 */
export const INQUIRY_ENROLL_SCAN = 500

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

type ContactRow = {
  id: string
  phone: string | null
  name: string | null
  marketing_opt_out_at: string | null
  marketing_opt_in: boolean | null
  whatsapp_marketing_opt_in: boolean | null
}

type EnrollOneResult =
  | { ok: true; action: 'enrolled' | 'bumped' }
  | { ok: false; reason: string }

function firstSendAtIso(now: Date): string {
  const windowDecision = shouldDeferOutsideIstWindow(now)
  return windowDecision.defer
    ? windowDecision.nextAt.toISOString()
    : now.toISOString()
}

/**
 * Enroll one conversation into the inquiry drip (or bump next_send_at when
 * already in progress so ops can force a same-tick send).
 */
export async function enrollInquiryConversation(
  db: SupabaseClient,
  conv: { id: string; account_id: string; contact_id: string },
  opts: {
    now?: Date
    /** When true, already-enrolled drips get next_send_at bumped to now. */
    bumpIfEnrolled?: boolean
    /** Skip silence / lookback gates (ops phone-targeted enroll). */
    ignoreTimingGates?: boolean
  } = {},
): Promise<EnrollOneResult> {
  const now = opts.now ?? new Date()

  const lastInbound = await lastCustomerMessageAt(db, conv.id)
  const { data: contact } = await db
    .from('contacts')
    .select(
      'id, phone, name, marketing_opt_out_at, marketing_opt_in, whatsapp_marketing_opt_in',
    )
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
    return { ok: false, reason: 'sequence_inactive' }
  }

  const { data: existingInquiry } = await db
    .from('shopify_recovery_tracking')
    .select('id')
    .eq('contact_id', conv.contact_id)
    .eq('sequence_id', inquirySeq.id)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle()

  if (existingInquiry?.id) {
    if (opts.bumpIfEnrolled) {
      const next = firstSendAtIso(now)
      await db
        .from('shopify_recovery_tracking')
        .update({ next_send_at: next, updated_at: now.toISOString() })
        .eq('id', existingInquiry.id)
      return { ok: true, action: 'bumped' }
    }
    return { ok: false, reason: 'already_enrolled' }
  }

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
    alreadyInInquiryDrip: false,
    inOtherRecoveryDrip: !!otherDrip,
    now,
  })

  if (!decision.eligible) {
    if (
      opts.ignoreTimingGates &&
      (decision.reason === 'still_active' || decision.reason === 'outside_lookback')
    ) {
      // ops force-path: allow enroll despite timing
    } else {
      return { ok: false, reason: decision.reason || 'ineligible' }
    }
  }

  const c = contact as ContactRow | null
  if (
    c &&
    c.marketing_opt_in !== true &&
    c.whatsapp_marketing_opt_in !== true
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
      .eq('id', c.id)
      .is('marketing_opt_out_at', null)
  }

  const texts = await recentMessageTexts(db, conv.id)
  const hint = extractProductHintFromTexts(texts)
  const firstSendAt = firstSendAtIso(now)

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
      return { ok: false, reason: insErr.message }
    }
    return { ok: false, reason: 'already_enrolled' }
  }
  return { ok: true, action: 'enrolled' }
}

/**
 * Scan quiet conversations in the lookback window and enroll no-purchase
 * inquirers. Oldest first so backlog leads (expired pickle / offer chats)
 * are not starved by the newest 200 inbox threads.
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
  // Ascending order: oldest-within-lookback enroll first (backlog catch-up).
  const { data: conversations, error } = await db
    .from('conversations')
    .select('id, account_id, contact_id, last_message_at, status')
    .not('contact_id', 'is', null)
    .gte('last_message_at', lookbackStart)
    .in('status', ['open', 'pending'])
    .order('last_message_at', { ascending: true })
    .limit(INQUIRY_ENROLL_SCAN)

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

    const result = await enrollInquiryConversation(
      db,
      {
        id: conv.id,
        account_id: conv.account_id,
        contact_id: conv.contact_id,
      },
      { now },
    )

    if (result.ok && result.action === 'enrolled') enrolled++
    else skipped++
  }

  return { scanned, enrolled, skipped }
}

/**
 * Ops: enroll (or bump) specific WhatsApp phones into the inquiry drip.
 * Used for expired threads the scan missed (e.g. Gaurang / Swapna).
 */
export async function enrollInquiryFollowupsByPhones(
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
      phones
        .map((p) => toMetaPhone(p))
        .filter((p) => p.length >= 10),
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

    const contact = (contacts ?? []).find(
      (c) => toMetaPhone(c.phone) === phone,
    )
    if (!contact?.id || !contact.account_id) {
      results.push({ phone, ok: false, reason: 'contact_not_found' })
      continue
    }

    const { data: conv } = await db
      .from('conversations')
      .select('id, account_id, contact_id')
      .eq('contact_id', contact.id)
      .eq('account_id', contact.account_id)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!conv?.id) {
      results.push({ phone, ok: false, reason: 'conversation_not_found' })
      continue
    }

    const result = await enrollInquiryConversation(
      db,
      {
        id: conv.id,
        account_id: conv.account_id,
        contact_id: conv.contact_id,
      },
      {
        now,
        bumpIfEnrolled: true,
        ignoreTimingGates: true,
      },
    )

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

export async function runInquiryFollowupEnrollmentCron(): Promise<Response> {
  const { supabaseAdmin } = await import('@/lib/automations/admin-client')
  const result = await enrollInquiryFollowups(supabaseAdmin())
  return NextResponse.json({ ok: true, ...result })
}
