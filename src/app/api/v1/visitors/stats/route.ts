import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { resolveStoreForAccount } from '@/lib/visitors/account-store'

export async function GET() {
  try {
    const ctx = await requireRole('viewer')
    const supabase = supabaseAdmin()
    const store = await resolveStoreForAccount(supabase, ctx.accountId)
    if (!store) {
      return NextResponse.json({
        identification: { total: 0, identified: 0, rate: 0, bySource: {} },
        funnel: { cart: {}, browse: {}, visit: {} },
      })
    }

    const since = new Date(Date.now() - 7 * 86400000).toISOString()

    const { count: totalSessions } = await supabase
      .from('visitor_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .gte('session_start', since)

    const { data: idRows } = await supabase
      .from('visitor_identity_map')
      .select('visitor_id, source')
      .eq('store_id', store.id)
      .gte('linked_at', since)

    const identifiedVisitors = new Set((idRows || []).map((r) => r.visitor_id))
    const bySource: Record<string, number> = {}
    for (const r of idRows || []) {
      const s = r.source || 'unknown'
      bySource[s] = (bySource[s] || 0) + 1
    }

    const total = totalSessions || 0
    const identified = identifiedVisitors.size
    const rate = total > 0 ? identified / total : 0

    const { data: nudges } = await supabase
      .from('visitor_nudge_log')
      .select('nudge_type, contact_id, sent_at, metadata')
      .eq('store_id', store.id)
      .gte('sent_at', since)

    const funnel: Record<string, { sent: number; clicked: number; purchased: number }> = {
      cart: { sent: 0, clicked: 0, purchased: 0 },
      browse: { sent: 0, clicked: 0, purchased: 0 },
      visit: { sent: 0, clicked: 0, purchased: 0 },
    }

    for (const n of nudges || []) {
      const t = n.nudge_type as keyof typeof funnel
      if (!funnel[t]) continue
      funnel[t].sent++
    }

    // Clicks ≈ contact_link_tokens.last_used_at after a nudge
    const { data: tokens } = await supabase
      .from('contact_link_tokens')
      .select('contact_id, last_used_at')
      .eq('store_id', store.id)
      .gte('last_used_at', since)

    const clickedContacts = new Set(
      (tokens || []).filter((t) => t.last_used_at).map((t) => t.contact_id),
    )
    for (const n of nudges || []) {
      const t = n.nudge_type as keyof typeof funnel
      if (funnel[t] && clickedContacts.has(n.contact_id)) {
        funnel[t].clicked++
      }
    }

    // Purchases in window for nudged contacts
    const nudgedContactIds = [...new Set((nudges || []).map((n) => n.contact_id))]
    if (nudgedContactIds.length) {
      const { data: orders } = await supabase
        .from('shopify_orders')
        .select('contact_id, total_price, created_at')
        .eq('account_id', ctx.accountId)
        .in('contact_id', nudgedContactIds)
        .gte('created_at', since)

      const purchased = new Set((orders || []).map((o) => o.contact_id))
      for (const n of nudges || []) {
        const t = n.nudge_type as keyof typeof funnel
        if (funnel[t] && purchased.has(n.contact_id)) {
          funnel[t].purchased++
        }
      }
    }

    return NextResponse.json({
      identification: { total, identified, rate, bySource },
      funnel,
      windowDays: 7,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
