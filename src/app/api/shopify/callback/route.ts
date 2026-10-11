import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { registerShopifyWebhooks } from '@/lib/shopify/register-webhooks'
import {
  OAUTH_STATE_COOKIE,
  verifyShopifyOAuthHmac,
} from '@/lib/shopify/oauth-hmac'
import { upsertInstalledStore } from '@/lib/shopify/install-store'
import { STORE_COOKIE, storeCookieOptions } from '@/lib/auth/store-cookie'
import { WORKSPACE_COOKIE, workspaceCookieOptions } from '@/lib/auth/workspace-cookie'
import { normalizeShopDomain } from '@/lib/shopify/store-credentials'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const shop = searchParams.get('shop')
    const hmac = searchParams.get('hmac')
    const state = searchParams.get('state')

    if (!code || !shop || !hmac || !state) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const secret = process.env.SHOPIFY_API_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'SHOPIFY_API_SECRET is not configured' }, { status: 500 })
    }

    if (!verifyShopifyOAuthHmac(searchParams, secret)) {
      return NextResponse.json({ error: 'HMAC validation failed' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const stored = cookieStore.get(OAUTH_STATE_COOKIE)?.value
    cookieStore.delete(OAUTH_STATE_COOKIE)
    if (!stored || !stored.startsWith(`${state}:`)) {
      return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 })
    }

    const shopDomain = normalizeShopDomain(shop)
    const apiKey = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID
    if (!apiKey) {
      return NextResponse.json({ error: 'SHOPIFY_API_KEY is not configured' }, { status: 500 })
    }

    const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
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
    const accessToken = tokenData.access_token as string
    const scopes = typeof tokenData.scope === 'string' ? tokenData.scope : undefined

    try {
      const results = await registerShopifyWebhooks({ shop: shopDomain, accessToken })
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        console.warn('[shopify-callback] webhook registration issues:', failed)
      }
    } catch (err) {
      console.error('[shopify-callback] webhook registration failed:', err)
    }

    const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01'
    const shopRes = await fetch(
      `https://${shopDomain}/admin/api/${apiVersion}/shop.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } },
    )

    let shopName = 'Shopify Store'
    let shopEmail = ''
    let shopifyShopId: string | null = null
    if (shopRes.ok) {
      const shopData = await shopRes.json()
      shopName = shopData.shop?.name || shopName
      shopEmail = shopData.shop?.email || ''
      shopifyShopId = shopData.shop?.id != null ? String(shopData.shop.id) : null
    }

    const supabase = await createClient()
    const admin = supabaseAdmin()
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    // Prefer active workspace of logged-in user; else existing shop workspace.
    let organizationId: string | null = null

    if (currentUser) {
      const activeWs = cookieStore.get(WORKSPACE_COOKIE)?.value
      if (activeWs) {
        const { data: member } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('workspace_id', activeWs)
          .eq('user_id', currentUser.id)
          .maybeSingle()
        if (member) organizationId = member.workspace_id
      }
      if (!organizationId) {
        const { data: first } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', currentUser.id)
          .limit(1)
          .maybeSingle()
        organizationId = first?.workspace_id ?? null
      }
    }

    const { data: existingByShop } = await admin
      .from('workspaces')
      .select('id')
      .eq('shopify_shop_domain', shopDomain)
      .maybeSingle()

    if (!organizationId && existingByShop) {
      organizationId = existingByShop.id
    }

    if (!organizationId) {
      const baseSlug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'shop'
      let slug = baseSlug
      let suffix = 1
      while (true) {
        const { data: existing } = await admin
          .from('workspaces')
          .select('id')
          .eq('slug', slug)
          .maybeSingle()
        if (!existing) break
        slug = `${baseSlug}-${suffix++}`
      }

      const { data: workspace, error: wsError } = await admin
        .from('workspaces')
        .insert({
          name: shopName,
          slug,
          shopify_shop_domain: shopDomain,
          status: 'active',
          plan: 'free',
        })
        .select('id')
        .single()

      if (wsError || !workspace) {
        return NextResponse.json(
          { error: wsError?.message || 'Failed to provision workspace' },
          { status: 500 },
        )
      }
      organizationId = workspace.id

      // Best-effort dual-model sync; ignore if accounts row shape differs.
      await admin.from('accounts').upsert(
        { id: workspace.id, name: shopName },
        { onConflict: 'id' },
      ).then(({ error }) => {
        if (error) console.warn('[shopify-callback] accounts upsert skipped:', error.message)
      })
    } else {
      await admin
        .from('workspaces')
        .update({
          shopify_shop_domain: shopDomain,
          status: 'active',
          name: shopName,
        })
        .eq('id', organizationId)
    }

    let userId = currentUser?.id ?? ''
    if (!userId && shopEmail) {
      const { data: existingProfile } = await admin
        .from('profiles')
        .select('user_id')
        .eq('email', shopEmail)
        .maybeSingle()
      if (existingProfile?.user_id) userId = existingProfile.user_id
    }

    if (userId) {
      await admin.from('workspace_members').upsert(
        {
          workspace_id: organizationId,
          user_id: userId,
          role: 'owner',
        },
        { onConflict: 'workspace_id,user_id' },
      )
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'Failed to resolve organization' }, { status: 500 })
    }

    const { storeId } = await upsertInstalledStore(admin, {
      organizationId,
      shopDomain,
      shopName,
      shopifyShopId,
      accessToken,
      scopes,
      actorUserId: userId || null,
    })

    // Dual-write status for integrations hub (no plaintext token)
    await admin.from('merchant_integrations').upsert(
      {
        account_id: organizationId,
        workspace_id: organizationId,
        integration_key: 'shopify',
        status: 'connected',
        config: { shop: shopDomain, storeId },
      },
      { onConflict: 'account_id,integration_key' },
    )

    cookieStore.set(WORKSPACE_COOKIE, organizationId, workspaceCookieOptions)
    cookieStore.set(STORE_COOKIE, storeId, storeCookieOptions)

    if (userId) {
      return NextResponse.redirect(new URL('/billing', request.url))
    }

    return NextResponse.redirect(
      new URL(
        `/signup?email=${encodeURIComponent(shopEmail)}&workspace_id=${organizationId}&shop=${encodeURIComponent(shopDomain)}`,
        request.url,
      ),
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[shopify-callback] Error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
