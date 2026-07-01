import { fetchShopify } from '../src/lib/shopify/shopify-client'

// Read base URL from command-line arguments
const appBaseUrl = process.argv[2]

if (!appBaseUrl) {
  console.error('Error: Please provide your public application base URL as an argument.')
  console.error('Usage: npx tsx scripts/register-shopify-webhooks.ts https://your-crm-domain.com')
  process.exit(1)
}

// Clean base URL (remove trailing slash)
const baseUrl = appBaseUrl.replace(/\/$/, '')

const WEBHOOKS = [
  { topic: 'checkouts/create', path: '/api/webhooks/shopify/checkouts-create' },
  { topic: 'checkouts/update', path: '/api/webhooks/shopify/checkouts-update' },
  { topic: 'orders/create', path: '/api/webhooks/shopify/orders-create' },
  { topic: 'orders/updated', path: '/api/webhooks/shopify/orders-updated' },
  { topic: 'fulfillments/create', path: '/api/webhooks/shopify/fulfillments-create' },
]

async function run() {
  console.log(`Starting Shopify webhook registration pointing to: ${baseUrl}\n`)

  // Check env settings
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  if (!domain) {
    console.error('SHOPIFY_STORE_DOMAIN is not set in environment variables.')
    process.exit(1)
  }

  for (const hook of WEBHOOKS) {
    const address = `${baseUrl}${hook.path}`
    console.log(`Registering topic "${hook.topic}" -> ${address}...`)

    try {
      const response = await fetchShopify('/webhooks.json', {
        method: 'POST',
        body: JSON.stringify({
          webhook: {
            topic: hook.topic,
            address,
            format: 'json',
          },
        }),
      })

      if (response.webhook) {
        console.log(`Successfully registered: ID ${response.webhook.id}`)
      } else {
        console.log(`Failed registration format:`, response)
      }
    } catch (err: any) {
      console.error(`Failed to register topic "${hook.topic}":`, err.message || err)
    }
  }

  console.log('\nRegistration script completed.')
}

run().catch((err) => {
  console.error('Unhandled script error:', err)
  process.exit(1)
})
