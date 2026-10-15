import { describe, expect, it } from 'vitest'
import {
  buildUnlockWhatsAppUrl,
  parseUnlockRefFromMessage,
} from './capture-settings'

describe('parseUnlockRefFromMessage', () => {
  it('extracts ref codes case-insensitively', () => {
    expect(
      parseUnlockRefFromMessage('Hi! Send my DP10 code (ref K7Q2MX)'),
    ).toBe('K7Q2MX')
    expect(parseUnlockRefFromMessage('ref abc123 please')).toBe('ABC123')
    expect(parseUnlockRefFromMessage('no code here')).toBeNull()
  })
})

describe('buildUnlockWhatsAppUrl', () => {
  it('builds a wa.me deep link', () => {
    const url = buildUnlockWhatsAppUrl({
      whatsappNumber: '919876543210',
      discountCode: 'DP10',
      refCode: 'ABCDEF',
    })
    expect(url).toContain('https://wa.me/919876543210')
    expect(url).toContain(encodeURIComponent('ref ABCDEF'))
  })
})
