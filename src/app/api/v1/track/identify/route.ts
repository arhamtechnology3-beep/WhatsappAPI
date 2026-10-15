import { z } from 'zod'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import {
  resolveStoreFromOrigin,
  visitorCorsPreflight,
  visitorJson,
} from '@/lib/visitors/store-context'
import { linkVisitorToContact } from '@/lib/visitors/identify'
import {
  resolveContactLinkToken,
  themeCustomerSecret,
  verifyShopifyCustomerSignature,
} from '@/lib/visitors/tokens'
import { toMetaPhone } from '@/lib/whatsapp/phone-utils'

const bodySchema = z.object({
  visitorId: z.string().min(8).max(128),
  sessionId: z.string().max(128).optional(),
  /** Tagged WhatsApp link token. */
  wcid: z.string().min(6).max(64).optional(),
  /** Signed Shopify customer (theme Liquid HMAC). */
  shopifyCustomerId: z.string().max(64).optional(),
  shopifyCustomerSig: z.string().max(128).optional(),
})

export async function OPTIONS(request: Request) {
  return visitorCorsPreflight(request)
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const supabase = supabaseAdmin()

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const limited = checkRateLimit(
    `visitor-identify:${ip}`,
    RATE_LIMITS.storefrontIdentify,
  )
  if (!limited.success) return rateLimitResponse(limited)

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return visitorJson({ error: 'Invalid JSON' }, 400, origin)
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return visitorJson({ error: 'Invalid payload' }, 400, origin)
  }

  const store = await resolveStoreFromOrigin(supabase, origin)
  if (!store) {
    return visitorJson({ error: 'Unknown store' }, 404, origin)
  }

  const { visitorId, wcid, shopifyCustomerId, shopifyCustomerSig } = parsed.data

  // 1) Tagged WhatsApp link
  if (wcid) {
    const resolved = await resolveContactLinkToken(supabase, {
      storeId: store.id,
      token: wcid,
    })
    if (!resolved) {
      // Identical response whether token unknown/expired — no enumeration.
      return visitorJson({ ok: true, linked: false }, 200, origin)
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, phone')
      .eq('id', resolved.contactId)
      .maybeSingle()

    if (!contact?.phone) {
      return visitorJson({ ok: true, linked: false }, 200, origin)
    }

    const result = await linkVisitorToContact(supabase, {
      storeId: store.id,
      organizationId: store.organization_id,
      visitorId,
      phone: contact.phone,
      contactId: contact.id,
      source: 'wa_link',
    })
    return visitorJson({ ok: true, linked: result.linked, source: 'wa_link' }, 200, origin)
  }

  // 2) Signed logged-in Shopify customer
  if (shopifyCustomerId) {
    const secret = themeCustomerSecret()
    if (
      !verifyShopifyCustomerSignature(
        shopifyCustomerId,
        shopifyCustomerSig,
        secret,
      )
    ) {
      return visitorJson({ ok: true, linked: false }, 200, origin)
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, phone, account_id')
      .eq('shopify_customer_id', String(shopifyCustomerId))
      .not('phone', 'is', null)
      .limit(1)
      .maybeSingle()

    if (!contact?.phone) {
      return visitorJson({ ok: true, linked: false }, 200, origin)
    }

    const phone = toMetaPhone(contact.phone) || contact.phone
    const result = await linkVisitorToContact(supabase, {
      storeId: store.id,
      organizationId: store.organization_id,
      visitorId,
      phone,
      contactId: contact.id,
      source: 'customer_login',
    })
    return visitorJson(
      { ok: true, linked: result.linked, source: 'customer_login' },
      200,
      origin,
    )
  }

  return visitorJson({ ok: true, linked: false }, 200, origin)
}
