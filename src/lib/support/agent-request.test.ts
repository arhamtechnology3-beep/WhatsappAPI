import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/automations/meta-send', () => ({ engineSendText: vi.fn() }))

import { isAgentRequest, supportContact, supportContactMessage } from './agent-request'

afterEach(() => vi.unstubAllEnvs())

describe('isAgentRequest', () => {
  it.each([
    'Talk to agent',
    'Talk to Agent',
    'Muze phone pe baat karni hai number bhejo',
    'can I speak with someone',
    'please call me',
    'aapka number do',
    'customer care number',
    'मुझे बात करनी है',
  ])('detects "%s"', (text) => {
    expect(isAgentRequest(text)).toBe(true)
  })

  it.each([
    'What is the status of my order',
    'DP/26/1012',
    'Order#1014',
    'All good',
    'Returns & Refund',
    'my phone number is 98673 03540',
    'Haven\'t received this order',
    '',
  ])('ignores "%s"', (text) => {
    expect(isAgentRequest(text)).toBe(false)
  })
})

describe('supportContact', () => {
  it('defaults to Arham Food 9167623044', () => {
    expect(supportContact()).toEqual({
      name: 'Arham Food',
      phone: '919167623044',
      display: '+91 91676 23044',
    })
    expect(supportContactMessage()).toContain('+91 91676 23044 (Arham Food)')
  })

  it('can be overridden by env', () => {
    vi.stubEnv('SUPPORT_CONTACT_PHONE', '+91 98200 00000')
    vi.stubEnv('SUPPORT_CONTACT_NAME', 'DivyaPrabha Foods')
    expect(supportContactMessage()).toContain('+91 98200 00000 (DivyaPrabha Foods)')
  })
})
