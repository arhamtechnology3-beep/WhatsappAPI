export const SHOPIFY_WEBHOOK_TOPICS = [
  { topic: 'checkouts/create', path: '/api/webhooks/shopify/checkouts-create' },
  { topic: 'checkouts/update', path: '/api/webhooks/shopify/checkouts-update' },
  { topic: 'orders/create', path: '/api/webhooks/shopify/orders-create' },
  { topic: 'orders/updated', path: '/api/webhooks/shopify/orders-updated' },
  { topic: 'fulfillments/create', path: '/api/webhooks/shopify/fulfillments-create' },
  { topic: 'customers/create', path: '/api/webhooks/shopify/customers-create' },
  { topic: 'customers/update', path: '/api/webhooks/shopify/customers-update' },
  { topic: 'app/uninstalled', path: '/api/webhooks/shopify/app-uninstalled' },
] as const

export function shopifyAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://whatsapp.arhamtechnology.com'
  return raw.replace(/\/$/, '')
}

export async function registerShopifyWebhooks(opts: {
  shop: string
  accessToken: string
  baseUrl?: string
  apiVersion?: string
}): Promise<{ topic: string; ok: boolean; error?: string }[]> {
  const shop = opts.shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const baseUrl = (opts.baseUrl || shopifyAppBaseUrl()).replace(/\/$/, '')
  const apiVersion = opts.apiVersion || process.env.SHOPIFY_API_VERSION || '2025-01'
  const results: { topic: string; ok: boolean; error?: string }[] = []

  let existingAddresses = new Set<string>()
  try {
    const listRes = await fetch(
      `https://${shop}/admin/api/${apiVersion}/webhooks.json`,
      { headers: { 'X-Shopify-Access-Token': opts.accessToken } },
    )
    if (listRes.ok) {
      const data = await listRes.json()
      for (const hook of data.webhooks || []) {
        if (hook.address) existingAddresses.add(String(hook.address))
      }
    }
  } catch (err) {
    console.warn('[shopify-webhooks] failed to list existing webhooks:', err)
  }

  for (const hook of SHOPIFY_WEBHOOK_TOPICS) {
    const address = `${baseUrl}${hook.path}`
    if (existingAddresses.has(address)) {
      results.push({ topic: hook.topic, ok: true })
      continue
    }
    try {
      const response = await fetch(
        `https://${shop}/admin/api/${apiVersion}/webhooks.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': opts.accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook: { topic: hook.topic, address, format: 'json' },
          }),
        },
      )
      if (!response.ok) {
        const text = await response.text()
        results.push({ topic: hook.topic, ok: false, error: text })
      } else {
        results.push({ topic: hook.topic, ok: true })
      }
    } catch (err) {
      results.push({
        topic: hook.topic,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}
