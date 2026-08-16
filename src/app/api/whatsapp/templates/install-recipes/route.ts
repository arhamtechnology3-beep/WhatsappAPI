import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { installShopifyTemplateRecipes } from '@/lib/shopify/install-template-recipes'

export async function POST() {
  try {
    const ctx = await requireRole('agent')
    const result = await installShopifyTemplateRecipes(
      supabaseAdmin(),
      ctx.accountId,
      ctx.userId,
    )
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    return toErrorResponse(err)
  }
}
