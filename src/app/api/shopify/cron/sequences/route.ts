import { authorizeCron } from '@/lib/cron/auth'
import { runShopifySequenceCron } from '@/lib/shopify/sequence-cron'

export async function GET(request: Request) {
  const denied = authorizeCron(request)
  if (denied) return denied
  return runShopifySequenceCron()
}
