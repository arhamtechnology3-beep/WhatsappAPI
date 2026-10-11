import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyApprovedTemplateUpgrade } from './shopify-helper'

function dbWithStatus(status: string | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: status ? { status } : null }),
  }
  return { from: () => chain } as unknown as SupabaseClient
}

const job = {
  templateName: 'wacrm_order_confirmed_v2',
  templateParams: ['parag', '1012', '1887.30'],
}
const data = {
  customer_name: 'parag',
  order_number: '1012',
  total_price: '1887.30',
  items_summary: 'Methia Keri × 1, Gunda Keri × 1, Gor Keri × 1',
}

describe('applyApprovedTemplateUpgrade', () => {
  it('switches to v3 with the items line once Meta approved it', async () => {
    const out = await applyApprovedTemplateUpgrade(dbWithStatus('APPROVED'), 'acc', job, data)
    expect(out.templateName).toBe('wacrm_order_confirmed_v3')
    expect(out.templateParams).toEqual([
      'parag',
      '1012',
      'Methia Keri × 1, Gunda Keri × 1, Gor Keri × 1',
      '1887.30',
    ])
  })

  it('stays on v2 while v3 is pending or missing', async () => {
    expect(await applyApprovedTemplateUpgrade(dbWithStatus('PENDING'), 'acc', job, data)).toBe(job)
    expect(await applyApprovedTemplateUpgrade(dbWithStatus(null), 'acc', job, data)).toBe(job)
  })

  it('stays on v2 when there are no items to list', async () => {
    expect(
      await applyApprovedTemplateUpgrade(dbWithStatus('APPROVED'), 'acc', job, {
        ...data,
        items_summary: '',
      }),
    ).toBe(job)
  })
})
