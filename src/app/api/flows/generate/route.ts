import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { validateFlowGraph } from "@/lib/flows/zod-schema";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `
You are an expert AI bot flow generator for "wacrm", a WhatsApp CRM tool.
You translate natural language requirements into structured JSON flow graphs that govern conversational bot behavior.

Your response must be ONLY a valid JSON object matching the following TypeScript schema:
{
  trigger_type: "keyword" | "first_inbound_message" | "manual",
  trigger_config: {
    keywords?: string[], // required if trigger_type is "keyword"
    match_type?: "exact" | "contains",
    case_sensitive?: boolean
  },
  entry_node_id: string, // must match node_key of the entry node
  nodes: Array<{
    node_key: string, // stable unique string key (e.g. "greeting", "ask_email", "end_node")
    node_type: "start" | "send_message" | "send_buttons" | "send_list" | "send_media" | "collect_input" | "condition" | "set_tag" | "handoff" | "end",
    config: Record<string, any>, // config fields specific to the node_type
    position_x?: number, // UI canvas x coordinate (increment by 150-250 per step to layout nicely)
    position_y?: number  // UI canvas y coordinate (increment by 150-200 per step to layout nicely)
  }>
}

### Node Type Schema Details:
1. "start" node:
   - Config: { next_node_key: string }
2. "send_message" (Send text message):
   - Config: { text: string (can interpolate variables like {{vars.my_var}}), next_node_key: string }
3. "send_buttons" (Sends up to 3 quick reply buttons):
   - Config: { text: string, header_text?: string, footer_text?: string, buttons: Array<{ reply_id: string, title: string (max 20 chars), next_node_key: string }> }
4. "send_list" (Sends a list of up to 10 menu options grouped in sections):
   - Config: { text: string, button_label: string (max 20 chars), header_text?: string, footer_text?: string, sections: Array<{ title?: string, rows: Array<{ reply_id: string, title: string (max 24 chars), description?: string (max 72 chars), next_node_key: string }> }> }
5. "send_media" (Sends image/video/document):
   - Config: { media_type: "image" | "video" | "document", media_url: string, caption?: string, filename?: string, next_node_key: string }
6. "collect_input" (Ask text question, saves reply into flow vars):
   - Config: { prompt_text: string, var_key: string (alphanumeric name like "customer_name"), validation?: "any" | "email" | "phone", next_node_key: string }
7. "condition" (Branches based on variable or tag):
   - Config: { subject: "var" | "tag" | "contact_field", subject_key: string, operator: "equals" | "contains" | "present" | "absent", value?: string, true_next: string, false_next: string }
8. "set_tag" (Tags contact):
   - Config: { mode: "add" | "remove", tag_id: string (UUID), next_node_key: string }
9. "handoff" (Handoff conversation to a human agent, terminal node):
   - Config: { note?: string, assign_to?: string }
10. "end" (Ends flow, terminal node):
    - Config: {}

### Edge Integrity Rules:
- Every node_key referenced in "next_node_key", "true_next", "false_next", or "entry_node_id" MUST exist in the "nodes" array.
- There must be no orphan edges.

### Response Constraint:
Do not include any pre-amble, conversational explanations, or markdown codeblocks in your final response. Respond ONLY with valid, raw, parseable JSON.
`;

const FEW_SHOT_EXAMPLES = [
  {
    role: "user",
    content: "Create a bot that welcomes customers, asks for their email, and then handsoff to an agent."
  },
  {
    role: "assistant",
    content: JSON.stringify({
      trigger_type: "keyword",
      trigger_config: { keywords: ["hello", "start", "hi"], match_type: "contains" },
      entry_node_id: "start",
      nodes: [
        {
          node_key: "start",
          node_type: "start",
          config: { next_node_key: "welcome_message" },
          position_x: 100,
          position_y: 100
        },
        {
          node_key: "welcome_message",
          node_type: "send_message",
          config: {
            text: "Welcome to our WhatsApp channel! Let's get you connected.",
            next_node_key: "collect_email"
          },
          position_x: 100,
          position_y: 250
        },
        {
          node_key: "collect_email",
          node_type: "collect_input",
          config: {
            prompt_text: "Please enter your email address so we can associate your account.",
            var_key: "customer_email",
            validation: "email",
            next_node_key: "agent_handoff"
          },
          position_x: 100,
          position_y: 400
        },
        {
          node_key: "agent_handoff",
          node_type: "handoff",
          config: {
            note: "Customer requested connection. Stored email: {{vars.customer_email}}"
          },
          position_x: 100,
          position_y: 550
        }
      ]
    })
  }
];

export async function POST(request: Request) {
  try {
    // 1. Authenticate User
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get account_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: "Your profile is not linked to an account." }, { status: 403 });
    }

    const accountId = profile.account_id;
    const body = await request.json().catch(() => ({}));
    const { requirement } = body;

    if (!requirement?.trim()) {
      return NextResponse.json({ error: "Requirement description is required." }, { status: 400 });
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Claude API key is not configured. Please add ANTHROPIC_API_KEY to your env variables." },
        { status: 500 }
      );
    }

    let parsedFlow: any = null;
    let attempts = 0;
    let lastError = "";

    const userMessage = {
      role: "user",
      content: `Generate a WhatsApp bot flow for this requirement: "${requirement}"`
    };

    const messages = [...FEW_SHOT_EXAMPLES, userMessage];

    while (attempts < 2) {
      attempts++;
      console.log(`[AI Bot Generator] Claude call attempt #${attempts}`);

      if (attempts === 2 && lastError) {
        messages.push({
          role: "assistant",
          content: parsedFlow ? JSON.stringify(parsedFlow) : "Error generating valid json"
        });
        messages.push({
          role: "user",
          content: `The previous response failed validation with error: "${lastError}". Please correct the JSON schema matching the strict system prompt requirements and output only raw, parseable JSON.`
        });
      }

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            messages: messages.filter(m => m.role === "user" || m.role === "assistant"),
          }),
        });

        if (!response.ok) {
          const rawErr = await response.text();
          throw new Error(`Claude API request failed: ${response.status} - ${rawErr}`);
        }

        const resData = await response.json();
        const rawContent = resData.content?.[0]?.text || "";

        // Extract JSON block in case Claude wrapped it in markdown quotes
        let cleanJson = rawContent.trim();
        const jsonMatch = cleanJson.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          cleanJson = jsonMatch[1];
        }

        parsedFlow = JSON.parse(cleanJson);

        // Validate structure
        const valResult = validateFlowGraph(parsedFlow);
        if (!valResult.success) {
          throw new Error(`Validation Error: ${valResult.error}`);
        }

        parsedFlow = valResult.data;
        break; // Success! Exit loop
      } catch (err: any) {
        console.warn(`[AI Bot Generator] Attempt #${attempts} failed:`, err.message);
        lastError = err.message || "Failed to generate or validate flow structure";
        if (attempts >= 2) {
          return NextResponse.json({ error: `AI generation failed: ${lastError}` }, { status: 400 });
        }
      }
    }

    // 2. Save flow graph in database as a draft
    const admin = supabaseAdmin();
    const { data: flow, error: flowErr } = await admin
      .from("flows")
      .insert({
        user_id: user.id,
        account_id: accountId,
        name: `AI Bot: ${requirement.substring(0, 24)}...`,
        description: `Generated from requirement: "${requirement}"`,
        status: "draft",
        trigger_type: parsedFlow.trigger_type,
        trigger_config: parsedFlow.trigger_config,
        entry_node_id: parsedFlow.entry_node_id,
        is_ai_generated: true,
        ai_requirement: requirement,
      })
      .select()
      .single();

    if (flowErr || !flow) {
      console.error("[AI Bot Generator] DB flow insert error:", flowErr);
      return NextResponse.json({ error: flowErr?.message || "Failed to create flow record." }, { status: 500 });
    }

    // Insert flow nodes
    const { error: nodesErr } = await admin.from("flow_nodes").insert(
      parsedFlow.nodes.map((n: any, idx: number) => ({
        flow_id: flow.id,
        node_key: n.node_key,
        node_type: n.node_type,
        config: n.config,
        position_x: n.position_x ?? (150 * (idx % 3)),
        position_y: n.position_y ?? (180 * idx),
      }))
    );

    if (nodesErr) {
      // Rollback flow header creation to keep clean DB state
      await admin.from("flows").delete().eq("id", flow.id);
      console.error("[AI Bot Generator] DB nodes insert error:", nodesErr);
      return NextResponse.json({ error: nodesErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, bot_id: flow.id });
  } catch (err: any) {
    console.error("[POST /api/flows/generate] error:", err.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
