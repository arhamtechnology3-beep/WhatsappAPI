import { NextResponse } from 'next/server'

function configuredOrigins(): string[] {
  const origins = new Set<string>([
    'http://127.0.0.1:9292',
    'http://localhost:3000',
  ])

  const extra = process.env.SHOPIFY_STOREFRONT_ORIGINS || ''
  extra.split(',').forEach((raw) => {
    const origin = raw.trim().replace(/\/$/, '')
    if (origin) origins.add(origin)
  })

  const domain = (process.env.SHOPIFY_STORE_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')

  if (domain) {
    origins.add(`https://${domain}`)
    origins.add(`https://www.${domain}`)
    if (!domain.includes('myshopify.com') && !domain.includes('.')) {
      origins.add(`https://${domain}.myshopify.com`)
    }
  }

  return [...origins]
}

export function applyShopifyCors(response: NextResponse, origin: string | null): NextResponse {
  const allowed = configuredOrigins()
  if (origin && allowed.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  } else if (allowed[0]) {
    response.headers.set('Access-Control-Allow-Origin', allowed[0])
  }
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept')
  response.headers.set('Access-Control-Max-Age', '86400')
  response.headers.set('Vary', 'Origin')
  return response
}

export function shopifyCorsPreflight(request: Request): NextResponse {
  const response = NextResponse.json({}, { status: 204 })
  return applyShopifyCors(response, request.headers.get('origin'))
}
