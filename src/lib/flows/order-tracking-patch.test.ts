import { describe, expect, it } from 'vitest'
import {
  expandOrderTrackingShopifyLookup,
  needsOrderTrackingShopifyPatch,
} from './order-tracking-patch'

const original = [
  {
    node_key: 'ask_order_no',
    node_type: 'collect_input',
    config: { prompt_text: 'ID', var_key: 'order_no', next_node_key: 'processing_msg' },
  },
  {
    node_key: 'processing_msg',
    node_type: 'send_message',
    config: {
      text: 'Checking details for order #{{vars.order_no}}',
      next_node_key: 'agent_handoff',
    },
  },
  {
    node_key: 'agent_handoff',
    node_type: 'handoff',
    config: { note: 'lookup' },
  },
]

describe('expandOrderTrackingShopifyLookup', () => {
  it('inserts Shopify lookup + concern menu before agent handoff', () => {
    expect(needsOrderTrackingShopifyPatch(original)).toBe(true)
    const next = expandOrderTrackingShopifyLookup(original)
    const processing = next.find((n) => n.node_key === 'processing_msg')
    expect(processing?.config.next_node_key).toBe('shopify_lookup')
    const lookup = next.find((n) => n.node_key === 'shopify_lookup')
    expect(lookup?.node_type).toBe('http_fetch')
    expect(lookup?.config).toMatchObject({
      kind: 'shopify_order',
      found_next: 'status_details',
      not_found_next: 'order_not_found',
    })
    const menu = next.find((n) => n.node_key === 'concern_menu')
    const buttons = (menu?.config as { buttons?: Array<{ title: string; next_node_key: string }> })
      .buttons
    expect(buttons?.map((b) => b.title)).toEqual(['All good', 'Talk to agent'])
    expect(buttons?.[1].next_node_key).toBe('agent_handoff')
    const handoff = next.find((n) => n.node_key === 'agent_handoff')
    expect(String(handoff?.config.note)).toContain('concern')
    expect(needsOrderTrackingShopifyPatch(next)).toBe(false)
  })
})
