import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { verifyShopifyWebhookSignature } from '@/lib/shopify/webhook-signature'

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

    const { error } = await supabase
      .from('workspaces')
      .update({ status: 'suspended' })
      .eq('shopify_shop_domain', shop)

    if (error) {
      console.error('[app-uninstalled] error suspending workspace:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[app-uninstalled] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
