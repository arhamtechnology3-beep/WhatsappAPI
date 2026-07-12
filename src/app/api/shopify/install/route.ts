import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const shop = searchParams.get('shop')

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 })
  }

  // Sanitize shop domain
  const shopDomain = shop.replace(/[^-a-zA-Z0-9.]/g, '')

  const apiKey = process.env.SHOPIFY_API_KEY || 'mock_api_key'
  const hostUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://whatsapp.arhamtechnology.com'
  const redirectUri = `${hostUrl}/api/shopify/callback`
  const scopes = 'read_customers,write_customers,read_orders,write_orders,read_draft_orders,write_draft_orders,read_checkouts,write_checkouts'
  const state = Math.random().toString(36).substring(2)

  const authorizationUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`

  return NextResponse.redirect(authorizationUrl)
}
