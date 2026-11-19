import { NextResponse } from 'next/server'
import { areChildCronRoutesDisabled } from '@/lib/cron/hostinger-profile'

/**
 * On Hostinger, only `/api/cron/tick` may run background work. Leftover
 * hPanel jobs that still hit child URLs used to multiply Meta/Shopify load
 * and bypass the tick single-flight lock.
 */
export function rejectChildCronIfDisabled(): Response | null {
  if (!areChildCronRoutesDisabled()) return null
  return NextResponse.json(
    {
      ok: false,
      error:
        'Child cron routes are disabled on Hostinger. Use only GET /api/cron/tick. Set ALLOW_CHILD_CRON_ROUTES=1 to re-enable.',
    },
    { status: 410 },
  )
}
