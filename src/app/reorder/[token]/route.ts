import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { loadFollowupByToken, markReorderClicked } from '@/lib/followups/order-followups'
import { reorderCartPath } from '@/lib/followups/plan'
import { storefrontProductById } from '@/lib/shopify/product-image'
import {
  collectionAllProductsUrl,
  storefrontBaseUrl,
} from '@/lib/shopify/whatsapp-template-library'
import { withContactWcid } from '@/lib/visitors/redirect-wcid'

export const dynamic = 'force-dynamic'

/** Same items, same quantities, straight to Shopify checkout (sold-out variants dropped). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const db = supabaseAdmin()
  const followup = await loadFollowupByToken(db, token)
  if (!followup) return NextResponse.redirect(collectionAllProductsUrl(), 302)
  await markReorderClicked(db, followup)

  const soldOut = new Set<string>()
  for (const product of followup.products) {
    const catalog = product.product_id ? await storefrontProductById(product.product_id) : null
    const variants = Array.isArray(catalog?.variants)
      ? (catalog?.variants as Array<{ id?: unknown; available?: unknown }>)
      : []
    for (const v of variants) {
      if (v.available === false) soldOut.add(String(v.id))
    }
  }

  const path = reorderCartPath(followup.products, soldOut)
  const target = path
    ? `${storefrontBaseUrl()}/${path}`
    : followup.products.find((p) => p.handle)?.handle
      ? `${storefrontBaseUrl()}/products/${followup.products.find((p) => p.handle)!.handle}`
      : collectionAllProductsUrl()

  const tagged = await withContactWcid(db, {
    accountId: followup.account_id,
    contactId: followup.contact_id,
    url: target,
  })
  return NextResponse.redirect(tagged, 302)
}
