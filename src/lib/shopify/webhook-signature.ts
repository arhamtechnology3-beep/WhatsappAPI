import crypto from 'node:crypto'

/**
 * Verify the HMAC-SHA256 signature that Shopify attaches to webhook POSTs.
 *
 * Shopify signs the raw request body with your API Client Secret and sends
 * the result in the `X-Shopify-Hmac-Sha256` header (Base64-encoded).
 */
export function verifyShopifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.SHOPIFY_API_SECRET?.trim()
  if (!secret) {
    console.error(
      '[shopify-webhook] SHOPIFY_API_SECRET is not set — rejecting webhook. ' +
        'Configure the env var in your .env.local file.',
    )
    return false
  }

  if (!signatureHeader) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64')

  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)

  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
