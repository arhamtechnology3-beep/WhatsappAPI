import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  OAUTH_STATE_COOKIE,
  createOAuthState,
  oauthStateCookieOptions,
} from '@/lib/shopify/oauth-hmac'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const shop = searchParams.get('shop')

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 })
  }

  const shopDomain = shop.replace(/[^-a-zA-Z0-9.]/g, '').toLowerCase()
  if (!shopDomain.includes('.')) {
    return NextResponse.json({ error: 'Invalid shop parameter' }, { status: 400 })
  }

  const apiKey = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID
  if (!apiKey) {
    return NextResponse.json({ error: 'SHOPIFY_API_KEY is not configured' }, { status: 500 })
  }
  const hostUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://whatsapp.arhamtechnology.com'
  const redirectUri = `${hostUrl.replace(/\/$/, '')}/api/shopify/callback`
  const scopes = [
    'read_customers',
    'write_customers',
    'read_orders',
    'write_orders',
    'read_draft_orders',
    'write_draft_orders',
    'read_checkouts',
    'write_checkouts',
    'read_fulfillments',
    'write_webhooks',
    'read_webhooks',
  ].join(',')

  const state = createOAuthState()
  const cookieStore = await cookies()
  cookieStore.set(
    OAUTH_STATE_COOKIE,
    `${state}:${shopDomain}`,
    oauthStateCookieOptions(process.env.NODE_ENV === 'production'),
  )

  const authorizationUrl =
    `https://${shopDomain}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(apiKey)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`

  return NextResponse.redirect(authorizationUrl)
}
