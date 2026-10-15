import { describe, expect, it } from 'vitest'
import { stripReturnsRefundFromFaqMenu } from './faq-menu-patch'

describe('stripReturnsRefundFromFaqMenu', () => {
  it('removes Returns & Refund from Choose Category list', () => {
    const nodes = [
      {
        node_key: 'faq_list',
        node_type: 'send_list',
        config: {
          text: 'Hello! How can we assist you today?',
          button_label: 'Choose Category',
          sections: [
            {
              title: 'Support Topics',
              rows: [
                {
                  reply_id: 'shipping',
                  title: 'Shipping Info',
                  description: 'Delivery times & fees',
                },
                {
                  reply_id: 'returns',
                  title: 'Returns & Refund',
                  description: 'Easy return policy',
                },
                {
                  reply_id: 'human',
                  title: 'Talk to Agent',
                  description: 'Connect with our team',
                },
              ],
            },
          ],
        },
      },
      {
        node_key: 'return_info',
        node_type: 'send_message',
        config: { text: 'We do not take returns.' },
      },
    ]

    const out = stripReturnsRefundFromFaqMenu(nodes)
    const list = out.find((n) => n.node_key === 'faq_list')!
    const rows = (list.config.sections as Array<{ rows: Array<{ title: string }> }>)[0]
      .rows
    expect(rows.map((r) => r.title)).toEqual([
      'Shipping Info',
      'Talk to Agent',
    ])
    expect(out.some((n) => n.node_key === 'return_info')).toBe(false)
  })

  it('is a no-op when returns already gone', () => {
    const nodes = [
      {
        node_key: 'faq_list',
        node_type: 'send_list',
        config: {
          sections: [
            {
              title: 'Support Topics',
              rows: [
                { reply_id: 'shipping', title: 'Shipping Info' },
                { reply_id: 'human', title: 'Talk to Agent' },
              ],
            },
          ],
        },
      },
    ]
    expect(stripReturnsRefundFromFaqMenu(nodes)).toBe(nodes)
  })
})
