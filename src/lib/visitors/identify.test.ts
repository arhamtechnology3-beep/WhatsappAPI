import { describe, expect, it } from 'vitest'
import { extractDpVisitorIdFromOrder } from './identify'

describe('extractDpVisitorIdFromOrder', () => {
  it('reads note_attributes', () => {
    expect(
      extractDpVisitorIdFromOrder({
        note_attributes: [
          { name: 'dp_visitor_id', value: 'vid-1' },
          { name: 'other', value: 'x' },
        ],
      }),
    ).toBe('vid-1')
  })

  it('reads cart attributes bag', () => {
    expect(
      extractDpVisitorIdFromOrder({
        attributes: { dp_visitor_id: 'vid-2' },
      }),
    ).toBe('vid-2')
  })

  it('returns null when missing', () => {
    expect(extractDpVisitorIdFromOrder({})).toBeNull()
  })
})
