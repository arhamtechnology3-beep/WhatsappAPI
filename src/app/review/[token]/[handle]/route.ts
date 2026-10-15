import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { loadFollowupByToken, markReviewOpened } from '@/lib/followups/order-followups'
import { reviewUrl, reviewableProducts } from '@/lib/followups/plan'
import { storefrontBaseUrl } from '@/lib/shopify/whatsapp-template-library'
import { withContactWcid } from '@/lib/visitors/redirect-wcid'

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
  const tagged = await withContactWcid(db, {
    accountId: followup.account_id,
    contactId: followup.contact_id,
    url: reviewUrl(product.handle),
  })
  return NextResponse.redirect(tagged, 302)
}
