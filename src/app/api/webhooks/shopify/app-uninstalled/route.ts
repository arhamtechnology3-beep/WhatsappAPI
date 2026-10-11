import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { verifyShopifyWebhookSignature } from '@/lib/shopify/webhook-signature'
import { markStoreUninstalled } from '@/lib/shopify/install-store'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('X-Shopify-Hmac-Sha256')
  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  try {
    const shop = request.headers.get('x-shopify-shop-domain')
    if (!shop) {
      return NextResponse.json({ error: 'Missing shop domain header' }, { status: 400 })
    }

    const supabase = supabaseAdmin()
    await markStoreUninstalled(supabase, shop)

    // Soft-suspend workspace status for legacy UI; do not wipe config.
    await supabase
      .from('workspaces')
      .update({ status: 'suspended' })
      .eq('shopify_shop_domain', shop)

    await supabase.from('merchant_integrations').update({
      status: 'disconnected',
      config: { shop, uninstalled: true },
    }).eq('integration_key', 'shopify')

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[app-uninstalled] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
