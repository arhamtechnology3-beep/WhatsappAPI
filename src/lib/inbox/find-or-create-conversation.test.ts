import { describe, expect, it } from 'vitest'
import { pickPreferredConversation } from './find-or-create-conversation'

describe('pickPreferredConversation', () => {
  it('returns null for an empty list', () => {
    expect(pickPreferredConversation([])).toBeNull()
  })

  it('prefers the most recently messaged thread', () => {
    const pick = pickPreferredConversation([
      { id: 'old', last_message_at: '2026-08-16T10:00:00.000Z', created_at: '2026-08-16T09:00:00.000Z' },
      { id: 'new', last_message_at: '2026-08-16T12:00:00.000Z', created_at: '2026-08-16T11:00:00.000Z' },
    ])
    expect(pick?.id).toBe('new')
  })
})
