import { fetchShopify } from '../src/lib/shopify/shopify-client'
import { registerShopifyWebhooks } from '../src/lib/shopify/register-webhooks'

const appBaseUrl = process.argv[2]

if (!appBaseUrl) {
  console.error('Error: Please provide your public application base URL as an argument.')
  console.error('Usage: npx tsx scripts/register-shopify-webhooks.ts https://your-crm-domain.com')
  process.exit(1)
}

const baseUrl = appBaseUrl.replace(/\/$/, '')

async function run() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN
  if (!domain || !token) {
    console.error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN must be set.')
    process.exit(1)
  }

  console.log(`Starting Shopify webhook registration pointing to: ${baseUrl}\n`)

  // Probe Admin API so misconfigured tokens fail fast.
  await fetchShopify('/shop.json')

  const results = await registerShopifyWebhooks({
    shop: domain,
    accessToken: token,
    baseUrl,
  })

  for (const result of results) {
    if (result.ok) console.log(`Registered ${result.topic}`)
    else console.error(`Failed ${result.topic}: ${result.error}`)
  }
}

run().catch((err) => {
  console.error('Unhandled script error:', err)
  process.exit(1)
})
