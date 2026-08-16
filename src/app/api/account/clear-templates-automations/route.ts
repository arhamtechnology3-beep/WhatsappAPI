import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { clearTemplatesAndAutomations } from '@/lib/account/clear-templates-automations'

export const maxDuration = 60

export async function POST() {
  try {
    const ctx = await requireRole('agent')
    const result = await clearTemplatesAndAutomations(
      supabaseAdmin(),
      ctx.accountId,
      ctx.userId
    )
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    return toErrorResponse(err)
  }
}
