import { NextResponse } from 'next/server'
import { authorizeCron } from '@/lib/cron/auth'
import { runAllCronJobs } from '@/lib/cron/tick'

/**
 * Single URL for Hostinger hPanel cron / curl.
 * Hits cart jobs, sequence drips, automation waits, and flow timeouts.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request)
  if (denied) return denied

  const result = await runAllCronJobs()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
