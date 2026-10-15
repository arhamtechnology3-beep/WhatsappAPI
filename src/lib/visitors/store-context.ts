import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export type VisitorStoreRow = {
  id: string
  organization_id: string
  name: string
  shop_domain: string | null
  status: string
}

function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  try {
    const u = new URL(raw.trim())
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

function hostFromOrigin(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase().replace(/^www\./, '')
  } catch {
    return origin.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')
  }
}

/**
 * Resolve the store for a storefront CORS request from Origin (never
 * trust a client-supplied storeId alone). Falls back to env-configured
 * origins / shop domain when only one active store matches.
 */
export async function resolveStoreFromOrigin(
  supabase: SupabaseClient,
  originHeader: string | null,
): Promise<VisitorStoreRow | null> {
  const origin = normalizeOrigin(originHeader)
  if (!origin) return null

  const host = hostFromOrigin(origin)
  const allowedEnv = (process.env.SHOPIFY_STOREFRONT_ORIGINS || '')
    .split(',')
    .map((s) => normalizeOrigin(s))
    .filter((s): s is string => !!s)

  const envDomain = (
    process.env.SHOPIFY_STORE_DOMAIN ||
    process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ||
    ''
  )
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase()
    .replace(/^www\./, '')

  const originAllowed =
    allowedEnv.length === 0 ||
    allowedEnv.some((o) => hostFromOrigin(o) === host) ||
    (!!envDomain && (host === envDomain || host.endsWith(`.${envDomain}`)))

  if (!originAllowed && allowedEnv.length > 0) {
    return null
  }

  const { data: stores } = await supabase
    .from('stores')
    .select('id, organization_id, name, shop_domain, status')
    .in('status', ['active', 'pending_install'])
    .not('shop_domain', 'is', null)

  const match =
    (stores ?? []).find((s) => {
      const domain = (s.shop_domain || '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .replace(/^www\./, '')
      if (!domain) return false
      return (
        host === domain ||
        host.endsWith(`.${domain}`) ||
        domain.endsWith(`.${host}`) ||
        host === domain.replace(/\.myshopify\.com$/, '')
      )
    }) ?? null

  if (match) return match as VisitorStoreRow

  // Single-tenant fallback: one active store + Origin matches env domain.
  if ((stores ?? []).length === 1 && originAllowed) {
    return stores![0] as VisitorStoreRow
  }

  if (envDomain && originAllowed) {
    const { data: byEnv } = await supabase
      .from('stores')
      .select('id, organization_id, name, shop_domain, status')
      .ilike('shop_domain', `%${envDomain}%`)
      .in('status', ['active', 'pending_install'])
      .limit(1)
      .maybeSingle()
    if (byEnv) return byEnv as VisitorStoreRow
  }

  return null
}

export function visitorCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Visitor-Id, X-Session-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  const normalized = normalizeOrigin(origin)
  if (normalized) {
    headers['Access-Control-Allow-Origin'] = normalized
  }
  return headers
}

export function visitorCorsPreflight(request: Request): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: visitorCorsHeaders(request.headers.get('origin')),
  })
}

export function visitorJson(
  body: unknown,
  status: number,
  origin: string | null,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: visitorCorsHeaders(origin),
  })
}
