import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/automations/meta-send', () => ({ engineSendText: vi.fn() }))
vi.mock('@/lib/flows/meta-send', () => ({ engineSendCtaUrl: vi.fn() }))

import { isAgentRequest, isSupportOpen, supportContact, supportReply } from './agent-request'

/** 14 Oct 2026 is a Wednesday; 18 Oct 2026 is a Sunday. Times are IST. */
const ist = (iso: string) => new Date(`${iso}+05:30`)

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
  })

  it('can be overridden by env', () => {
    vi.stubEnv('SUPPORT_CONTACT_PHONE', '+91 98200 00000')
    vi.stubEnv('SUPPORT_CONTACT_NAME', 'DivyaPrabha Foods')
    expect(supportContact()).toMatchObject({ name: 'DivyaPrabha Foods', phone: '919820000000' })
  })
})

describe('isSupportOpen', () => {
  it.each([
    ['2026-10-14T09:00:00', true],
    ['2026-10-14T18:59:00', true],
    ['2026-10-17T12:00:00', true],
    ['2026-10-14T08:59:00', false],
    ['2026-10-14T19:00:00', false],
    ['2026-10-14T23:30:00', false],
    ['2026-10-18T12:00:00', false],
  ])('%s IST → %s', (iso, open) => {
    expect(isSupportOpen(ist(iso))).toBe(open)
  })
})

describe('supportReply', () => {
  it('offers a Chat with Agent button in office hours, with no number or call option', () => {
    const reply = supportReply(ist('2026-10-14T15:00:00'))
    expect(reply).toMatchObject({
      kind: 'chat',
      buttonText: 'Chat with Agent',
      footer: 'Chat only · Monday to Saturday, 9 AM - 7 PM',
    })
    if (reply.kind !== 'chat') throw new Error('expected chat')
    expect(reply.url).toMatch(/^https:\/\/wa\.me\/919167623044\?text=/)
    expect(reply.body).not.toMatch(/call|91676/i)
    expect(reply.footer.length).toBeLessThanOrEqual(60)
  })

  it('asks to leave a message outside office hours', () => {
    const reply = supportReply(ist('2026-10-18T11:00:00'))
    expect(reply.kind).toBe('closed')
    if (reply.kind !== 'closed') throw new Error('expected closed')
    expect(reply.text).toContain('Monday to Saturday, 9 AM - 7 PM')
    expect(reply.text).toContain('leave your message here')
    expect(reply.text).not.toMatch(/call|91676/i)
  })
})
