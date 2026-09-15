import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { fetchActiveShopifyDiscount } from '@/lib/shopify/active-discount'

export async function GET() {
  try {
    await getCurrentAccount()
    const discount = await fetchActiveShopifyDiscount()
    return NextResponse.json({ success: true, discount })
  } catch (err) {
    return toErrorResponse(err)
  }
}
