import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { alignShopifyAutomations } from '@/lib/shopify/automation-bindings'

export async function POST() {
  try {
    const ctx = await requireRole('agent')
    const db = supabaseAdmin()
    const { error: mergeErr } = await db.rpc('merge_duplicate_conversations')
    if (mergeErr) {
      console.warn('[align-automations] conversation merge skipped:', mergeErr.message)
    }
    const result = await alignShopifyAutomations(db, ctx.accountId)
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    return toErrorResponse(err)
  }
}
