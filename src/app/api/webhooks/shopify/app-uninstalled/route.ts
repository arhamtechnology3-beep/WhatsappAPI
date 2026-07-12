import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const shop = request.headers.get('x-shopify-shop-domain')
    if (!shop) {
      return NextResponse.json({ error: 'Missing shop domain header' }, { status: 400 })
    }

    const supabase = await createClient()

    // Find and suspend workspace
    const { error } = await supabase
      .from('workspaces')
      .update({ status: 'suspended' })
      .eq('shopify_shop_domain', shop)

    if (error) {
      console.error('[app-uninstalled] error suspending workspace:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[app-uninstalled] error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
