import { NextResponse } from 'next/server'
import { authorizeCron } from '@/lib/cron/auth'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { enrollInquiryFollowupsByPhones } from '@/lib/followups/inquiry-followup'
import { runShopifySequenceCron } from '@/lib/shopify/sequence-cron'

/**
 * Ops: enroll specific phones into the inquiry follow-up drip, then run
 * the sequence sender so templates go out on this request.
 *
 *   curl -fsSL "https://…/api/cron/inquiry-enroll?secret=…&phones=918879554842,919059227738"
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

  if (phones.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'phones_required',
        hint: 'Pass ?phones=918879554842,919059227738',
      },
      { status: 400 },
    )
  }

  if (phones.length > 25) {
    return NextResponse.json(
      { ok: false, error: 'too_many_phones', max: 25 },
      { status: 400 },
    )
  }

  const enroll = await enrollInquiryFollowupsByPhones(supabaseAdmin(), phones)
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
