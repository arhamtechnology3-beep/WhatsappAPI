import { authorizeCron } from '@/lib/cron/auth'
import { rejectChildCronIfDisabled } from '@/lib/cron/child-route-guard'
import { runShopifyAbandonedCron } from '@/lib/shopify/abandoned-cron'

export async function GET(request: Request) {
  const child = rejectChildCronIfDisabled()
  if (child) return child
  const denied = authorizeCron(request)
  if (denied) return denied
  return runShopifyAbandonedCron()
}
