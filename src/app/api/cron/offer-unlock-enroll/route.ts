import { NextResponse } from 'next/server'
import { authorizeCron } from '@/lib/cron/auth'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  enrollOfferUnlockBacklog,
  enrollOfferUnlockByPhones,
} from '@/lib/followups/offer-unlock-followup'
import { runShopifySequenceCron } from '@/lib/shopify/sequence-cron'

/**
 * Ops: enroll website DP10 / unlock claims into the no-purchase drip,
 * then run sequence sends.
 *
 * All backlog:
 *   curl -fsSL "https://…/api/cron/offer-unlock-enroll?secret=…"
 *
 * Specific phones (e.g. Swapna):
 *   curl -fsSL "https://…/api/cron/offer-unlock-enroll?secret=…&phones=919059227738"
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request)
  if (denied) return denied

  const url = new URL(request.url)
  const raw = url.searchParams.get('phones') || ''
  const phones = raw
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (phones.length > 25) {
    return NextResponse.json(
      { ok: false, error: 'too_many_phones', max: 25 },
      { status: 400 },
    )
  }

  const db = supabaseAdmin()
  const enroll = phones.length
    ? await enrollOfferUnlockByPhones(db, phones)
    : await enrollOfferUnlockBacklog(db)

  const sendRes = await runShopifySequenceCron()
  let sendBody: unknown
  try {
    sendBody = await sendRes.json()
  } catch {
    sendBody = { error: `non-json ${sendRes.status}` }
  }

  return NextResponse.json({
    ok: true,
    enroll,
    sequences: { status: sendRes.status, body: sendBody },
  })
}
