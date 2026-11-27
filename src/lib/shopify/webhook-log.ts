import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Full Shopify/Shiprocket webhook bodies are large and were a Free-plan
 * egress/log contributor. Default: store a tiny summary only.
 * Set `SHOPIFY_WEBHOOK_LOG_FULL_PAYLOAD=1` to keep the raw JSON again.
 */
export function isFullShopifyWebhookPayloadEnabled(
  raw: string | undefined = process.env.SHOPIFY_WEBHOOK_LOG_FULL_PAYLOAD,
): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function pickId(payload: Record<string, unknown>, keys: string[]): string | number | null {
  for (const k of keys) {
    const v = payload[k]
    if (typeof v === 'string' || typeof v === 'number') return v
  }
  return null
}

/** Compact audit row — enough to debug, not a full order dump. */
export function compactShopifyWebhookPayload(
  topic: string,
  payload: unknown,
): Record<string, unknown> {
  if (isFullShopifyWebhookPayloadEnabled()) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>
    }
    return { raw: payload ?? null }
  }

  const p =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}

  return {
    _compact: true,
    topic,
    id: pickId(p, ['id', 'order_id', 'checkout_id', 'customer_id', 'awb']),
    token: typeof p.token === 'string' ? p.token.slice(0, 64) : null,
    email: typeof p.email === 'string' ? '[redacted]' : null,
    phone: typeof p.phone === 'string' ? '[redacted]' : null,
    financial_status:
      typeof p.financial_status === 'string' ? p.financial_status : null,
    fulfillment_status:
      typeof p.fulfillment_status === 'string' ? p.fulfillment_status : null,
    abandoned_checkout_url: p.abandoned_checkout_url ? true : null,
    line_item_count: Array.isArray(p.line_items) ? p.line_items.length : null,
  }
}

export async function insertShopifyWebhookLog(
  supabase: SupabaseClient,
  row: {
    account_id: string
    topic: string
    payload: unknown
    status: string
    error_message?: string | null
  },
) {
  return supabase.from('shopify_webhook_logs').insert({
    account_id: row.account_id,
    topic: row.topic,
    payload: compactShopifyWebhookPayload(row.topic, row.payload),
    status: row.status,
    error_message: row.error_message ?? null,
  })
}
