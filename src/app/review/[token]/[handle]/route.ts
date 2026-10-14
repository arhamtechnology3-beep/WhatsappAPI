import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { loadFollowupByToken, markReviewOpened } from '@/lib/followups/order-followups'
import { reviewUrl, reviewableProducts } from '@/lib/followups/plan'
import { storefrontBaseUrl } from '@/lib/shopify/whatsapp-template-library'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; handle: string }> },
) {
  const { token, handle } = await params
  const db = supabaseAdmin()
  const followup = await loadFollowupByToken(db, token)
  const product = followup
    ? reviewableProducts(followup.products).find((p) => p.handle === handle)
    : undefined
  if (!followup || !product?.handle) {
    return NextResponse.redirect(storefrontBaseUrl(), 302)
  }
  await markReviewOpened(db, followup, product.handle)
  return NextResponse.redirect(reviewUrl(product.handle), 302)
}
