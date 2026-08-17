import { describe, expect, it } from 'vitest'
import {
  duplicateTrackingIdsToStop,
  isCartSequenceTemplate,
  metadataWithSentStep,
  stepAlreadySent,
} from './sequence-dedupe'

describe('duplicateTrackingIdsToStop', () => {
  it('keeps the newest drip per contact+sequence and stops the rest', () => {
    const stop = duplicateTrackingIdsToStop([
      {
        id: 'old',
        contact_id: 'c1',
        sequence_id: 'cart',
        created_at: '2026-08-15T00:00:00.000Z',
      },
      {
        id: 'new',
        contact_id: 'c1',
        sequence_id: 'cart',
        created_at: '2026-08-16T00:00:00.000Z',
      },
      {
        id: 'other',
        contact_id: 'c2',
        sequence_id: 'cart',
        created_at: '2026-08-16T00:00:00.000Z',
      },
    ])
    expect(stop).toEqual(['old'])
  })
})

describe('stepAlreadySent', () => {
  it('records and detects a sent step', () => {
    expect(stepAlreadySent({}, 3)).toBe(false)
    const next = metadataWithSentStep({}, 3)
    expect(stepAlreadySent(next, 3)).toBe(true)
    expect(stepAlreadySent(next, 2)).toBe(false)
    expect(metadataWithSentStep(next, 3).sent_steps).toEqual([3])
  })
})

describe('isCartSequenceTemplate', () => {
  it('matches cart drip templates only', () => {
    expect(isCartSequenceTemplate('wacrm_cart_reminder_step3_v2')).toBe(true)
    expect(isCartSequenceTemplate('wacrm_cart_abandoned_v4')).toBe(true)
    expect(isCartSequenceTemplate('wacrm_order_confirmed_v2')).toBe(false)
  })
})
