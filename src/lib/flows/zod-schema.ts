import { z } from "zod";

// Zod schemas for each node config type
export const StartNodeConfigSchema = z.object({
  next_node_key: z.string(),
});

export const SendMessageNodeConfigSchema = z.object({
  text: z.string(),
  next_node_key: z.string(),
});

export const SendButtonsNodeConfigSchema = z.object({
  text: z.string(),
  header_text: z.string().optional(),
  footer_text: z.string().optional(),
  buttons: z.array(
    z.object({
      reply_id: z.string(),
      title: z.string().max(20),
      next_node_key: z.string(),
    })
  ).min(1).max(3),
});

export const SendListNodeConfigSchema = z.object({
  text: z.string(),
  button_label: z.string().max(20),
  header_text: z.string().optional(),
  footer_text: z.string().optional(),
  sections: z.array(
    z.object({
      title: z.string().max(20).optional(),
      rows: z.array(
        z.object({
          reply_id: z.string(),
          title: z.string().max(24),
          description: z.string().max(72).optional(),
          next_node_key: z.string(),
        })
      ).min(1).max(10),
    })
  ).min(1),
});

export const SendMediaNodeConfigSchema = z.object({
  media_type: z.enum(["image", "video", "document"]),
  media_url: z.string(),
  caption: z.string().optional(),
  filename: z.string().optional(),
  next_node_key: z.string(),
});

export const CollectInputNodeConfigSchema = z.object({
  prompt_text: z.string(),
  var_key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  validation: z.enum(["any", "email", "phone", "regex"]).optional(),
  regex: z.string().optional(),
  next_node_key: z.string(),
});

export const ConditionNodeConfigSchema = z.object({
  subject: z.enum(["var", "tag", "contact_field"]),
  subject_key: z.string(),
  operator: z.enum(["equals", "contains", "present", "absent"]),
  value: z.string().optional(),
  true_next: z.string(),
  false_next: z.string(),
});

export const SetTagNodeConfigSchema = z.object({
  mode: z.enum(["add", "remove"]),
  tag_id: z.string(),
  next_node_key: z.string(),
});

export const HandoffNodeConfigSchema = z.object({
  note: z.string().optional(),
  assign_to: z.string().optional(),
});

export const EndNodeConfigSchema = z.record(z.string(), z.unknown()).optional();

// Generic Node Schema
export const FlowNodeSchema = z.object({
  node_key: z.string(),
  node_type: z.enum([
    "start",
    "send_message",
    "send_buttons",
    "send_list",
    "send_media",
    "collect_input",
    "condition",
    "set_tag",
    "handoff",
    "end",
  ]),
  config: z.record(z.string(), z.any()),
  position_x: z.number().default(0).optional(),
  position_y: z.number().default(0).optional(),
});

// Flow Graph Schema
export const FlowGraphSchema = z.object({
  trigger_type: z.enum(["keyword", "first_inbound_message", "manual"]),
  trigger_config: z.object({
    keywords: z.array(z.string()).optional(),
    match_type: z.enum(["exact", "contains"]).optional(),
    case_sensitive: z.boolean().optional(),
  }).default({}),
  entry_node_id: z.string(),
  nodes: z.array(FlowNodeSchema).min(1),
});

// Validator function for internal configs and edge consistency
export function validateFlowGraph(json: any): { success: true; data: any } | { success: false; error: string } {
  // 1. Zod Parse
  const result = FlowGraphSchema.safeParse(json);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  const flow = result.data;
  const nodeKeys = new Set(flow.nodes.map((n) => n.node_key));

  // Verify entry node exists
  if (!nodeKeys.has(flow.entry_node_id)) {
    return { success: false, error: `entry_node_id "${flow.entry_node_id}" does not match any node_key in the nodes list` };
  }

  // 2. Validate node configurations and edge targets
  for (const node of flow.nodes) {
    try {
      const cfg = node.config;
      let targets: string[] = [];

      switch (node.node_type) {
        case "start": {
          const parsed = StartNodeConfigSchema.parse(cfg);
          targets.push(parsed.next_node_key);
          break;
        }
        case "send_message": {
          const parsed = SendMessageNodeConfigSchema.parse(cfg);
          targets.push(parsed.next_node_key);
          break;
        }
        case "send_buttons": {
          const parsed = SendButtonsNodeConfigSchema.parse(cfg);
          parsed.buttons.forEach((b) => targets.push(b.next_node_key));
          break;
        }
        case "send_list": {
          const parsed = SendListNodeConfigSchema.parse(cfg);
          parsed.sections.forEach((s) => {
            s.rows.forEach((r) => targets.push(r.next_node_key));
          });
          break;
        }
        case "send_media": {
          const parsed = SendMediaNodeConfigSchema.parse(cfg);
          targets.push(parsed.next_node_key);
          break;
        }
        case "collect_input": {
          const parsed = CollectInputNodeConfigSchema.parse(cfg);
          targets.push(parsed.next_node_key);
          break;
        }
        case "condition": {
          const parsed = ConditionNodeConfigSchema.parse(cfg);
          targets.push(parsed.true_next);
          targets.push(parsed.false_next);
          break;
        }
        case "set_tag": {
          const parsed = SetTagNodeConfigSchema.parse(cfg);
          targets.push(parsed.next_node_key);
          break;
        }
        case "handoff": {
          HandoffNodeConfigSchema.parse(cfg);
          break;
        }
        case "end": {
          EndNodeConfigSchema.parse(cfg);
          break;
        }
      }

      // Check edge consistency
      for (const target of targets) {
        if (!nodeKeys.has(target)) {
          return { success: false, error: `Node "${node.node_key}" points to non-existent target node_key: "${target}"` };
        }
      }
    } catch (err: any) {
      return { success: false, error: `Invalid config for node "${node.node_key}" of type "${node.node_type}": ${err.message}` };
    }
  }

  return { success: true, data: flow };
}
