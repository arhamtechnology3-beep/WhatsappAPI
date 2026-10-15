import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { STOREFRONT_ORIGIN } from '@/lib/shopify/whatsapp-template-library'

export type VisitorStoreRow = {
  id: string
  organization_id: string
  name: string
  shop_domain: string | null
  status: string
}

export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  try {
    const u = new URL(raw.trim())
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

export function hostFromOrigin(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase().replace(/^www\./, '')
  } catch {
    return origin.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')
  }
}

function normalizeShopDomain(raw: string | null | undefined): string {
  return (raw || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/^www\./, '')
}

/** Brand slug from a custom domain host, e.g. divyaprabhafoods.com → divyaprabhafoods */
export function brandSlugFromHost(host: string): string {
  const bare = host.toLowerCase().replace(/^www\./, '')
  const first = bare.split('.')[0] || ''
  return first.replace(/[^a-z0-9-]/g, '')
}

function storeMatchesHost(store: VisitorStoreRow, host: string): boolean {
  const domain = normalizeShopDomain(store.shop_domain)
  if (!domain) return false
  const slug = brandSlugFromHost(host)
  const shopSlug = domain.replace(/\.myshopify\.com$/, '')
  return (
    host === domain ||
    host.endsWith(`.${domain}`) ||
    domain.endsWith(`.${host}`) ||
    host === shopSlug ||
    (!!slug && (shopSlug.includes(slug) || domain.includes(slug))) ||
    (!!slug && (store.name || '').toLowerCase().includes(slug.replace(/foods$/, '')))
  )
}

/**
 * Resolve the store for a storefront CORS request from Origin (never
 * trust a client-supplied storeId alone). Falls back to env-configured
 * origins / shop domain when only one active store matches.
 *
 * Custom domains (divyaprabhafoods.com) often differ from Shopify
 * `*.myshopify.com` shop_domain — we alias via SHOPIFY_STOREFRONT_ORIGINS,
 * NEXT_PUBLIC_STOREFRONT_URL, and brand-slug fuzzy match.
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

  const publicStorefront = normalizeOrigin(
    process.env.NEXT_PUBLIC_STOREFRONT_URL || STOREFRONT_ORIGIN,
  )
  const publicHost = publicStorefront ? hostFromOrigin(publicStorefront) : ''

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
    (!!publicHost && host === publicHost) ||
    (!!envDomain && (host === envDomain || host.endsWith(`.${envDomain}`)))

  if (!originAllowed && allowedEnv.length > 0) {
    return null
  }

  const { data: stores } = await supabase
    .from('stores')
    .select('id, organization_id, name, shop_domain, status')
    .in('status', ['active', 'pending_install'])

  const list = (stores ?? []) as VisitorStoreRow[]

  const match = list.find((s) => storeMatchesHost(s, host)) ?? null
  if (match) return match

  // Allowed custom-domain Origin + exactly one store (typical single-tenant).
  if (list.length === 1 && originAllowed) {
    return list[0]
  }

  // Brand-slug fuzzy among multiple stores (e.g. Origin divyaprabhafoods.com,
  // shop_domain xxx.myshopify.com / name DivyaPrabha).
  if (originAllowed && list.length > 1) {
    const slug = brandSlugFromHost(host)
    const fuzzy =
      list.find((s) => storeMatchesHost(s, host)) ||
      list.find((s) => {
        const d = normalizeShopDomain(s.shop_domain)
        const n = (s.name || '').toLowerCase()
        return (
          (!!slug && d.includes(slug)) ||
          (!!slug && n.includes(slug.replace(/foods$/, ''))) ||
          (!!publicHost && d.includes(brandSlugFromHost(publicHost)))
        )
      })
    if (fuzzy) return fuzzy
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

  // Last resort: any active store when Origin is the configured storefront.
  if (originAllowed && publicHost && host === publicHost && list.length >= 1) {
    return list[0]
  }

  // Single-tenant Hostinger: IdentityFlow `stores` may never have been
  // backfilled (Shopify still runs on env tokens). Auto-provision once.
  if (originAllowed) {
    const ensured = await ensureEnvBackedStore(supabase, {
      host,
      publicHost,
      envDomain,
    })
    if (ensured) return ensured
  }

  return null
}

/**
 * Create (or reuse) a store row for the env Shopify domain so visitor
 * tracking works before a full IdentityFlow Shopify OAuth install.
 */
export async function ensureEnvBackedStore(
  supabase: SupabaseClient,
  opts: { host: string; publicHost: string; envDomain: string },
): Promise<VisitorStoreRow | null> {
  let shopDomain = normalizeShopDomain(
    opts.envDomain ||
      process.env.SHOPIFY_STORE_DOMAIN ||
      process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ||
      '',
  )
  if (
    !shopDomain ||
    shopDomain === 'divyaprabhafoods.com' ||
    shopDomain === 'www.divyaprabhafoods.com'
  ) {
    shopDomain = 'divyaprabhafoods.myshopify.com'
  }
  if (!shopDomain.includes('.')) {
    shopDomain = `${shopDomain}.myshopify.com`
  }

  const { data: existing } = await supabase
    .from('stores')
    .select('id, organization_id, name, shop_domain, status')
    .eq('shop_domain', shopDomain)
    .maybeSingle()
  if (existing) {
    if (existing.status !== 'active' && existing.status !== 'pending_install') {
      await supabase
        .from('stores')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      return { ...existing, status: 'active' } as VisitorStoreRow
    }
    return existing as VisitorStoreRow
  }

  // Prefer workspace that already claims this shop domain, else first workspace.
  let orgId: string | null = null
  let orgName = 'DivyaPrabha Foods'
  const { data: byShop } = await supabase
    .from('workspaces')
    .select('id, name, shopify_shop_domain')
    .eq('shopify_shop_domain', shopDomain)
    .maybeSingle()
  if (byShop?.id) {
    orgId = byShop.id
    orgName = byShop.name || orgName
  } else {
    const { data: anyWs } = await supabase
      .from('workspaces')
      .select('id, name')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (anyWs?.id) {
      orgId = anyWs.id
      orgName = anyWs.name || orgName
    }
  }
  if (!orgId) {
    const { data: acct } = await supabase
      .from('accounts')
      .select('id, name')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (acct?.id) {
      orgId = acct.id
      orgName = acct.name || orgName
    }
  }
  if (!orgId) return null

  const { data: created, error } = await supabase
    .from('stores')
    .insert({
      organization_id: orgId,
      name: orgName,
      shop_domain: shopDomain,
      status: 'active',
    })
    .select('id, organization_id, name, shop_domain, status')
    .maybeSingle()

  if (error) {
    // Race: another request inserted the same shop_domain.
    const { data: raced } = await supabase
      .from('stores')
      .select('id, organization_id, name, shop_domain, status')
      .eq('shop_domain', shopDomain)
      .maybeSingle()
    if (raced) return raced as VisitorStoreRow
    console.error('[visitors] ensureEnvBackedStore', error.message)
    return null
  }

  // Keep workspace pointer in sync when empty.
  await supabase
    .from('workspaces')
    .update({ shopify_shop_domain: shopDomain })
    .eq('id', orgId)
    .is('shopify_shop_domain', null)

  return created as VisitorStoreRow
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
    // Echo a concrete Origin (never *) so credentials are legal if a
    // storefront fetch wrapper forces credentials:'include'.
    headers['Access-Control-Allow-Origin'] = normalized
    headers['Access-Control-Allow-Credentials'] = 'true'
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
