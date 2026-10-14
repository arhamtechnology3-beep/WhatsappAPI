import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: (v: string) => `plain-${v}` }))
const propagate = vi.fn()
vi.mock('@/lib/shopify/automation-bindings', () => ({
  propagateTemplateApproval: (...args: unknown[]) => propagate(...args),
}))

import { syncPendingTemplateStatuses } from './pending-template-sync'

function fakeDb(rows: Array<Record<string, unknown>>) {
  const updates: Array<{ values: Record<string, unknown>; id: unknown }> = []
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, { select: self, eq: self, not: self, limit: self })
      if (table === 'message_templates') {
        chain.limit = async () => ({ data: rows })
        chain.update = (values: Record<string, unknown>) => ({
          eq: async (_col: string, id: unknown) => {
            updates.push({ values, id })
            return { error: null }
          },
        })
      } else {
        chain.maybeSingle = async () => ({ data: { access_token: 'enc' } })
      }
      return chain
    },
  }
  return { db: db as unknown as SupabaseClient, updates }
}

afterEach(() => {
  vi.unstubAllGlobals()
  propagate.mockReset()
})

describe('syncPendingTemplateStatuses', () => {
  const row = { id: 'r1', account_id: 'acc', name: 'wacrm_owner_new_order_v1', status: 'PENDING', meta_template_id: '178' }

  it('flips an approved template and propagates it', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () => new Response(JSON.stringify({ status: 'APPROVED' })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { db, updates } = fakeDb([row])
    const res = await syncPendingTemplateStatuses(db, { force: true })
    expect(res).toEqual({ checked: 1, updated: 1 })
    expect(updates[0]).toMatchObject({ id: 'r1', values: { status: 'APPROVED', rejection_reason: null } })
    expect(propagate).toHaveBeenCalledWith(db, 'acc', 'wacrm_owner_new_order_v1', 'APPROVED')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/178?fields=status')
  })

  it('leaves a still-pending template alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'PENDING' }))))
    const { db, updates } = fakeDb([row])
    expect(await syncPendingTemplateStatuses(db, { force: true })).toEqual({ checked: 1, updated: 0 })
    expect(updates).toHaveLength(0)
  })

  it('records the rejection reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'REJECTED', rejected_reason: 'INVALID_FORMAT' }))))
    const { db, updates } = fakeDb([row])
    await syncPendingTemplateStatuses(db, { force: true })
    expect(updates[0].values).toMatchObject({ status: 'REJECTED', rejection_reason: 'INVALID_FORMAT' })
  })

  it('is throttled between ticks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'PENDING' }))))
    const { db } = fakeDb([row])
    await syncPendingTemplateStatuses(db, { force: true, now: 1_000_000 })
    expect(await syncPendingTemplateStatuses(db, { now: 1_000_000 + 60_000 })).toEqual({ skipped: 'throttled', checked: 0, updated: 0 })
  })
})
