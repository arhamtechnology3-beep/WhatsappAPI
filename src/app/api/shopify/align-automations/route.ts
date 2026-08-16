import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { alignShopifyAutomations } from '@/lib/shopify/automation-bindings'

export async function POST() {
  try {
    const ctx = await requireRole('agent')
    const result = await alignShopifyAutomations(supabaseAdmin(), ctx.accountId)
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    return toErrorResponse(err)
  }
}
