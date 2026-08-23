import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

export function cronSecretConfigured(): boolean {
  return Boolean(
    process.env.AUTOMATION_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim(),
  )
}

/**
 * Authorize scheduled GET cron routes.
 *
 * Accepts:
 *   - `x-cron-secret: $AUTOMATION_CRON_SECRET` (external pingers)
 *   - `Authorization: Bearer $CRON_SECRET` (Vercel Cron; Vercel sets
 *     CRON_SECRET automatically when that env var is present)
 *   - `?secret=` or `?cron_secret=` (Hostinger / wget cannot always set headers)
 *
 * AUTOMATION_CRON_SECRET and CRON_SECRET may be the same value.
 */
export function authorizeCron(request: Request): NextResponse | null {
  const expected =
    process.env.AUTOMATION_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ''

  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }

  const headerSecret = request.headers.get('x-cron-secret') ?? ''
  const auth = request.headers.get('authorization') ?? ''
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : ''
  const querySecret = queryCronSecret(request)

  if (
    secretsEqual(headerSecret, expected) ||
    secretsEqual(bearer, expected) ||
    secretsEqual(querySecret, expected)
  ) {
    return null
  }

  // Vercel also sends CRON_SECRET even when we primarily use AUTOMATION_CRON_SECRET
  const vercelSecret = process.env.CRON_SECRET?.trim() || ''
  if (vercelSecret && secretsEqual(bearer, vercelSecret)) {
    return null
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function queryCronSecret(request: Request): string {
  try {
    const url = new URL(request.url)
    return (
      url.searchParams.get('secret')?.trim() ||
      url.searchParams.get('cron_secret')?.trim() ||
      ''
    )
  } catch {
    return ''
  }
}

function secretsEqual(supplied: string, expected: string): boolean {
  if (!supplied || !expected) return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
