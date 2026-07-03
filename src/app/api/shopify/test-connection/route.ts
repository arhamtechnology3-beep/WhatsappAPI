import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getShopInfo } from '@/lib/shopify/shopify-client'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getShopifyAccountContext, resolvePipelineAndStages } from '@/lib/shopify/shopify-helper'

export async function GET() {
  try {
    // Restrict to admins and owners
    await requireRole('admin')
    
    // Automatically trigger database sales pipeline e-commerce migration check
    const supabase = supabaseAdmin()
    const { accountId, userId } = await getShopifyAccountContext(supabase)
    if (accountId && userId) {
      await resolvePipelineAndStages(supabase, accountId, userId)
    }

    // Call shopify to verify credentials
    const shop = await getShopInfo()
    
    return NextResponse.json({
      success: true,
      shopName: shop.name,
      domain: shop.domain,
    })
  } catch (err: any) {
    // If it's a shopify error (e.g. invalid credential), wrap it as a nice response
    console.error('[shopify-test-connection] error:', err.message || err)
    if (err.message && err.message.includes('Shopify API error')) {
      return NextResponse.json({
        success: false,
        error: err.message,
      }, { status: 400 })
    }
    return toErrorResponse(err)
  }
}
