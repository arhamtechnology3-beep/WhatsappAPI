import { describe, expect, it } from 'vitest'
import { isCourierWebhookAuthorized } from './courier-webhook'

describe('isCourierWebhookAuthorized', () => {
  it('accepts only the configured x-api-key', () => {
    expect(isCourierWebhookAuthorized('abc123', 'abc123')).toBe(true)
    expect(isCourierWebhookAuthorized(' abc123 ', 'abc123')).toBe(true)
    expect(isCourierWebhookAuthorized('abc124', 'abc123')).toBe(false)
    expect(isCourierWebhookAuthorized('abc', 'abc123')).toBe(false)
    expect(isCourierWebhookAuthorized(null, 'abc123')).toBe(false)
  })

  it('rejects everything when no token is configured', () => {
    expect(isCourierWebhookAuthorized('anything', undefined)).toBe(false)
    expect(isCourierWebhookAuthorized('anything', '')).toBe(false)
  })
})
