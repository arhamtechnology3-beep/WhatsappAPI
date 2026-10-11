import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const sendMock = vi.fn()

vi.mock('next/server', () => ({ after: (fn: () => void) => fn() }))
vi.mock('@/lib/automations/admin-client', () => ({ supabaseAdmin: vi.fn() }))
vi.mock('@/lib/automations/meta-send', () => ({
  engineSendTemplate: (...args: unknown[]) => sendMock(...args),
}))
vi.mock('@/lib/inbox/find-or-create-conversation', () => ({
  findOrCreateConversation: vi.fn(async () => ({ id: 'conv-1' })),
}))

import {
  processWhatsAppSendJobs,
  shopifyOrderIdFromJobKey,
} from './process-send-jobs'

type Row = Record<string, unknown>

/** Minimal in-memory PostgREST stand-in: filters are applied on await. */
function memoryDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const preds: Array<(r: Row) => boolean> = []
    let patch: Row | null = null
    let limit = Infinity
    const rows = () => (tables[table] ||= [])
    const run = () => {
      const hit = rows().filter((r) => preds.every((p) => p(r))).slice(0, limit)
      if (patch) hit.forEach((r) => Object.assign(r, patch))
      return hit.map((r) => ({ ...r }))
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (p: Row) => ((patch = p), chain),
      eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), chain),
      in: (c: string, v: unknown[]) => (preds.push((r) => v.includes(r[c])), chain),
      lt: (c: string, v: number) => (preds.push((r) => (r[c] as number) < v), chain),
      lte: (c: string, v: string) => (preds.push((r) => String(r[c]) <= v), chain),
      order: () => chain,
      limit: (n: number) => ((limit = n), chain),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => void) => res({ data: run(), error: null }),
    }
    return chain
  }
  return { from } as unknown as SupabaseClient
}

describe('processWhatsAppSendJobs', () => {
  beforeEach(() => sendMock.mockReset())

  it('sends a job once even when two drains race (duplicate Shopify webhook)', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const db = memoryDb({
      whatsapp_send_jobs: [
        {
          id: 'job-1',
          account_id: 'acc',
          contact_id: 'c1',
          template_name: 'wacrm_order_confirmed_v2',
          template_params: ['parag', '1012', '1887.30'],
          status: 'pending',
          attempts: 0,
          run_at: past,
          idempotency_key: 'order_created:18908909109462:wacrm_order_confirmed_v2',
        },
      ],
      accounts: [{ id: 'acc', owner_user_id: 'u1' }],
      contacts: [{ id: 'c1', phone: '919867303540' }],
    })

    let release!: () => void
    sendMock.mockImplementationOnce(
      () => new Promise((r) => (release = () => r({ whatsapp_message_id: 'wamid.1' }))),
    )
    sendMock.mockResolvedValue({ whatsapp_message_id: 'wamid.dup' })

    const first = processWhatsAppSendJobs({ supabase: db, jobIds: ['job-1'] })
    await new Promise((r) => setTimeout(r, 0))
    const second = await processWhatsAppSendJobs({ supabase: db, jobIds: ['job-1'] })
    const third = await processWhatsAppSendJobs({ supabase: db })
    release()
    await first

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(second.processed + third.processed).toBe(0)
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      shopifyOrderId: '18908909109462',
    })
  })
})

describe('shopifyOrderIdFromJobKey', () => {
  it('reads the order id from order and shipment keys', () => {
    expect(shopifyOrderIdFromJobKey('order_created:123:wacrm_order_confirmed_v2')).toBe('123')
    expect(shopifyOrderIdFromJobKey('shipment_dispatched:456')).toBe('456')
    expect(shopifyOrderIdFromJobKey('shipment_ndr:789:2026-10-11')).toBe('789')
  })

  it('ignores cart keys and missing keys', () => {
    expect(shopifyOrderIdFromJobKey('cart_abandoned:https://x/checkouts/1:tpl')).toBeNull()
    expect(shopifyOrderIdFromJobKey(null)).toBeNull()
  })
})
