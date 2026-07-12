import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const shop = searchParams.get('shop')
    const hmac = searchParams.get('hmac')

    if (!code || !shop || !hmac) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // 1) Verify HMAC signature
    const secret = process.env.SHOPIFY_API_SECRET || 'mock_api_secret'
    const params: string[] = []
    searchParams.forEach((val, key) => {
      if (key !== 'hmac') {
        params.push(`${key}=${val}`)
      }
    })
    params.sort()
    const message = params.join('&')
    const generatedHmac = crypto.createHmac('sha256', secret).update(message).digest('hex')

    if (generatedHmac !== hmac) {
      return NextResponse.json({ error: 'HMAC validation failed' }, { status: 400 })
    }

    // 2) Exchange code for access token
    const apiKey = process.env.SHOPIFY_API_KEY || 'mock_api_key'
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: secret,
        code,
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      return NextResponse.json({ error: 'Token exchange failed: ' + errText }, { status: 500 })
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    // 3) Fetch Shop details
    const shopRes = await fetch(`https://${shop}/admin/api/2024-04/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
      },
    })
    
    let shopName = 'Shopify Store'
    let shopEmail = ''
    if (shopRes.ok) {
      const shopData = await shopRes.json()
      shopName = shopData.shop?.name || shopName
      shopEmail = shopData.shop?.email || ''
    }

    const supabase = await createClient()

    // 4) Check if workspace already exists for this shopify_shop_domain
    const { data: existingWorkspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('shopify_shop_domain', shop)
      .maybeSingle()

    const cookieStore = await cookies()

    if (existingWorkspace) {
      // Set active workspace cookie
      cookieStore.set('wacrm_active_workspace_id', existingWorkspace.id, { path: '/' })
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // 5) Create new workspace
    const baseSlug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    let slug = baseSlug
    let suffix = 1
    while (true) {
      const { data: existing } = await supabase
        .from('workspaces')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (!existing) break
      slug = `${baseSlug}-${suffix++}`
    }

    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({
        name: shopName,
        slug,
        shopify_shop_domain: shop,
        status: 'active',
        plan: 'free',
      })
      .select()
      .single()

    if (wsError || !workspace) {
      return NextResponse.json({ error: wsError?.message || 'Failed to provision workspace' }, { status: 500 })
    }

    // 6) Resolve installing user
    let userId = ''
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    
    if (currentUser) {
      userId = currentUser.id
    } else if (shopEmail) {
      // Look up if user with email already exists in profiles
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', shopEmail)
        .maybeSingle()
      if (existingProfile) {
        userId = existingProfile.id
      }
    }

    if (userId) {
      // Link user as owner in workspace_members
      await supabase.from('workspace_members').insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner',
      })

      // Store Shopify token in merchant_integrations
      await supabase.from('merchant_integrations').insert({
        workspace_id: workspace.id,
        integration_key: 'shopify',
        status: 'connected',
        config: { accessToken, shop },
      })

      cookieStore.set('wacrm_active_workspace_id', workspace.id, { path: '/' })
      return NextResponse.redirect(new URL('/settings?tab=whatsapp', request.url))
    } else {
      // Store Shopify token in merchant_integrations
      await supabase.from('merchant_integrations').insert({
        workspace_id: workspace.id,
        integration_key: 'shopify',
        status: 'connected',
        config: { accessToken, shop },
      })

      // Redirect to signup page pre-populating details to register owner
      return NextResponse.redirect(new URL(`/signup?email=${encodeURIComponent(shopEmail)}&workspace_id=${workspace.id}&shop=${encodeURIComponent(shop)}`, request.url))
    }
  } catch (err: any) {
    console.error('[shopify-callback] Error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
