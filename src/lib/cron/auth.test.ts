import { afterEach, describe, expect, it } from 'vitest'
import { authorizeCron } from './auth'

const ORIGINAL = {
  automation: process.env.AUTOMATION_CRON_SECRET,
  cron: process.env.CRON_SECRET,
}

afterEach(() => {
  process.env.AUTOMATION_CRON_SECRET = ORIGINAL.automation
  process.env.CRON_SECRET = ORIGINAL.cron
})

describe('authorizeCron', () => {
  it('returns 503 when no secret is configured', async () => {
    delete process.env.AUTOMATION_CRON_SECRET
    delete process.env.CRON_SECRET
    const res = authorizeCron(new Request('http://localhost/api/cron/tick'))
    expect(res?.status).toBe(503)
  })

  it('accepts x-cron-secret', async () => {
    process.env.AUTOMATION_CRON_SECRET = 'test-secret-value'
    delete process.env.CRON_SECRET
    const res = authorizeCron(
      new Request('http://localhost/api/cron/tick', {
        headers: { 'x-cron-secret': 'test-secret-value' },
      }),
    )
    expect(res).toBeNull()
  })

  it('accepts ?secret= for Hostinger wget', async () => {
    process.env.AUTOMATION_CRON_SECRET = 'test-secret-value'
    delete process.env.CRON_SECRET
    const res = authorizeCron(
      new Request('http://localhost/api/cron/tick?secret=test-secret-value'),
    )
    expect(res).toBeNull()
  })

  it('rejects a wrong query secret', async () => {
    process.env.AUTOMATION_CRON_SECRET = 'test-secret-value'
    delete process.env.CRON_SECRET
    const res = authorizeCron(
      new Request('http://localhost/api/cron/tick?secret=nope'),
    )
    expect(res?.status).toBe(401)
  })
})
