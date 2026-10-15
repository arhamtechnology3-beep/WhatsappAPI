import { createHash, randomBytes, createHmac, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const TOKEN_BYTES = 9
const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000

export function newContactLinkToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function newUnlockRefCode(): string {
  // Short, human-typed in WhatsApp: e.g. K7Q2MX
  return randomBytes(3).toString('hex').toUpperCase().slice(0, 6)
}

export function appendWcid(urlOrPath: string, token: string): string {
  if (!token) return urlOrPath
  try {
    if (/^https?:\/\//i.test(urlOrPath)) {
      const u = new URL(urlOrPath)
      u.searchParams.set('wcid', token)
      return u.toString()
    }
  } catch {
    /* fall through */
  }
  const sep = urlOrPath.includes('?') ? '&' : '?'
  return `${urlOrPath}${sep}wcid=${encodeURIComponent(token)}`
}

/**
 * Ensure a contact has a live wcid token for this store. Reuses an
 * unexpired token when present.
 */
export async function ensureContactLinkToken(
  supabase: SupabaseClient,
  opts: {
    storeId: string
    organizationId: string
    accountId: string
    contactId: string
    ttlMs?: number
    now?: Date
  },
): Promise<string | null> {
  const now = opts.now ?? new Date()
  const { data: existing } = await supabase
    .from('contact_link_tokens')
    .select('token, expires_at')
    .eq('store_id', opts.storeId)
    .eq('contact_id', opts.contactId)
    .gt('expires_at', now.toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.token) return existing.token

  const token = newContactLinkToken()
  const expiresAt = new Date(
    now.getTime() + (opts.ttlMs ?? DEFAULT_TTL_MS),
  ).toISOString()

  const { error } = await supabase.from('contact_link_tokens').insert({
    token,
    store_id: opts.storeId,
    organization_id: opts.organizationId,
    account_id: opts.accountId,
    contact_id: opts.contactId,
    expires_at: expiresAt,
  })

  if (error) {
    console.error('[visitors] ensureContactLinkToken', error.message)
    return null
  }
  return token
}

export async function resolveContactLinkToken(
  supabase: SupabaseClient,
  opts: { storeId: string; token: string; now?: Date },
): Promise<{ contactId: string; tokenId: string } | null> {
  const now = opts.now ?? new Date()
  const { data } = await supabase
    .from('contact_link_tokens')
    .select('id, contact_id, expires_at')
    .eq('store_id', opts.storeId)
    .eq('token', opts.token)
    .maybeSingle()

  if (!data?.contact_id) return null
  if (new Date(data.expires_at).getTime() <= now.getTime()) return null

  await supabase
    .from('contact_link_tokens')
    .update({ last_used_at: now.toISOString() })
    .eq('id', data.id)

  return { contactId: data.contact_id, tokenId: data.id }
}

/** HMAC of Shopify customer id for theme → CRM identify. */
export function signShopifyCustomerId(
  customerId: string,
  secret: string,
): string {
  return createHmac('sha256', secret).update(String(customerId)).digest('hex')
}

export function verifyShopifyCustomerSignature(
  customerId: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature || !secret || !customerId) return false
  const expected = signShopifyCustomerId(customerId, secret)
  try {
    const a = Buffer.from(signature, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function themeCustomerSecret(): string {
  return (
    process.env.VISITOR_THEME_HMAC_SECRET?.trim() ||
    process.env.ENCRYPTION_KEY?.trim() ||
    process.env.SHOPIFY_API_SECRET?.trim() ||
    ''
  )
}

export function hashPhoneForLog(phone: string): string {
  return createHash('sha256').update(phone).digest('hex').slice(0, 12)
}
