import { authorizeCron } from '@/lib/cron/auth'
import { runShopifyAbandonedCron } from '@/lib/shopify/abandoned-cron'

export async function GET(request: Request) {
  const denied = authorizeCron(request)
  if (denied) return denied
  return runShopifyAbandonedCron()
}
