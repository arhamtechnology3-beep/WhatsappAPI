import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getShopInfo } from '@/lib/shopify/shopify-client'

export async function GET() {
  try {
    // Restrict to admins and owners
    await requireRole('admin')
    
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
