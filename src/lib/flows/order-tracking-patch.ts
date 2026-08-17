/**
 * Order Status Tracking (bot template `order_tracking`) used to collect
 * an order number then immediately hand off. After the Shopify lookup
 * node exists, rewrite that graph in memory (and on save) so the
 * customer gets order details in chat first.
 */

export interface PatchableNode {
  node_key: string
  node_type: string
  config: Record<string, unknown>
  position_x?: number
  position_y?: number
  id?: string
  flow_id?: string
  created_at?: string
}

const LOOKUP_KEY = 'shopify_lookup'
const STATUS_KEY = 'status_details'
const NOT_FOUND_KEY = 'order_not_found'
const CONCERN_KEY = 'concern_menu'
const END_KEY = 'end_ok'

function processingNode<T extends PatchableNode>(nodes: T[]): T | undefined {
  return nodes.find(
    (n) => n.node_key === 'processing_msg' || n.node_key === 'check_status_msg',
  )
}

export function needsOrderTrackingShopifyPatch(
  nodes: PatchableNode[],
): boolean {
  if (nodes.some((n) => n.node_type === 'http_fetch' || n.node_key === LOOKUP_KEY)) {
    return false
  }
  const processing = processingNode(nodes)
  if (!processing) return false
  return (processing.config as { next_node_key?: string }).next_node_key ===
    'agent_handoff'
}

export function expandOrderTrackingShopifyLookup<T extends PatchableNode>(
  nodes: T[],
): T[] {
  if (!needsOrderTrackingShopifyPatch(nodes)) return nodes
  const processing = processingNode(nodes)!
  const extras = [
    {
      node_key: LOOKUP_KEY,
      node_type: 'http_fetch',
      config: {
        kind: 'shopify_order',
        order_var_key: 'order_no',
        found_next: STATUS_KEY,
        not_found_next: NOT_FOUND_KEY,
      },
      position_x: (processing.position_x ?? 0) + 280,
      position_y: processing.position_y ?? 0,
    },
    {
      node_key: STATUS_KEY,
      node_type: 'send_message',
      config: {
        text: '{{vars.order_summary}}',
        next_node_key: CONCERN_KEY,
      },
      position_x: (processing.position_x ?? 0) + 560,
      position_y: (processing.position_y ?? 0) - 80,
    },
    {
      node_key: NOT_FOUND_KEY,
      node_type: 'send_message',
      config: {
        text: '{{vars.order_summary}}',
        next_node_key: CONCERN_KEY,
      },
      position_x: (processing.position_x ?? 0) + 560,
      position_y: (processing.position_y ?? 0) + 160,
    },
    {
      node_key: CONCERN_KEY,
      node_type: 'send_buttons',
      config: {
        text: 'Aur kuch help chahiye?',
        footer_text: 'Select an option',
        buttons: [
          {
            reply_id: 'all_good',
            title: 'All good',
            next_node_key: END_KEY,
          },
          {
            reply_id: 'has_concern',
            title: 'Talk to agent',
            next_node_key: 'agent_handoff',
          },
        ],
      },
      position_x: (processing.position_x ?? 0) + 840,
      position_y: processing.position_y ?? 0,
    },
    {
      node_key: END_KEY,
      node_type: 'end',
      config: {},
      position_x: (processing.position_x ?? 0) + 1120,
      position_y: (processing.position_y ?? 0) - 80,
    },
  ] as T[]

  return [
    ...nodes.map((n) => {
      if (n.node_key === processing.node_key) {
        return {
          ...n,
          config: {
            ...n.config,
            text: 'Checking details for order #{{vars.order_no}} in our system. One moment...',
            next_node_key: LOOKUP_KEY,
          },
        }
      }
      if (n.node_key === 'agent_handoff' && n.node_type === 'handoff') {
        return {
          ...n,
          config: {
            ...n.config,
            note:
              'Customer asked to talk to an agent (Other Query, or a concern after seeing Shopify order status). Order #{{vars.order_no}}.',
          },
        }
      }
      return n
    }),
    ...extras,
  ]
}

export function toFlowNodeInserts(flowId: string, nodes: PatchableNode[]) {
  return expandOrderTrackingShopifyLookup(nodes).map((n) => ({
    flow_id: flowId,
    node_key: n.node_key,
    node_type: n.node_type,
    config: n.config,
    position_x: n.position_x ?? 0,
    position_y: n.position_y ?? 0,
  }))
}
