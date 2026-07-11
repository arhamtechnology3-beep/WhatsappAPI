import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
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

    const admin = supabaseAdmin();

    // 1. Check if a flow cloned from this template already exists
    const { data: existingFlow } = await admin
      .from("flows")
      .select("id")
      .eq("account_id", accountId)
      .eq("template_key", key)
      .maybeSingle();

    if (existingFlow) {
      // Flow already exists, just toggle it back ON (active)
      const updateData: Record<string, any> = {
        status: "active",
        updated_at: new Date().toISOString(),
      };

      // Allow updating trigger configuration (e.g. customized keywords) on activation
      if (body.trigger_config) {
        updateData.trigger_config = body.trigger_config;
      }

      const { error: updateErr } = await admin
        .from("flows")
        .update(updateData)
        .eq("id", existingFlow.id);

      if (updateErr) {
        console.error("Error activating existing flow:", updateErr);
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, flow_id: existingFlow.id });
    }

    // 2. Cloned flow doesn't exist, create a new one from template definitions
    const { data: template, error: tmplErr } = await admin
      .from("bot_templates")
      .select("*")
      .eq("key", key)
      .maybeSingle();

    if (tmplErr || !template) {
      return NextResponse.json({ error: `Template not found for key: ${key}` }, { status: 404 });
    }

    const flowJson = template.flow_json;

    // Use trigger config from body if customized, otherwise fall back to template default
    const finalTriggerConfig = body.trigger_config || flowJson.trigger_config || {};

    const { data: newFlow, error: insertFlowErr } = await admin
      .from("flows")
      .insert({
        user_id: user.id,
        account_id: accountId,
        name: template.name,
        description: template.description,
        status: "active",
        trigger_type: flowJson.trigger_type,
        trigger_config: finalTriggerConfig,
        entry_node_id: flowJson.entry_node_id,
        template_key: key,
      })
      .select()
      .single();

    if (insertFlowErr || !newFlow) {
      console.error("Error creating flow from template:", insertFlowErr);
      return NextResponse.json({ error: insertFlowErr?.message || "Failed to create bot copy." }, { status: 500 });
    }

    // Create flow nodes
    const { error: insertNodesErr } = await admin.from("flow_nodes").insert(
      (flowJson.nodes || []).map((n: any, idx: number) => ({
        flow_id: newFlow.id,
        node_key: n.node_key,
        node_type: n.node_type,
        config: n.config,
        position_x: n.position_x ?? (150 * (idx % 3)),
        position_y: n.position_y ?? (180 * idx),
      }))
    );

    if (insertNodesErr) {
      // Rollback flow header to keep DB clean
      await admin.from("flows").delete().eq("id", newFlow.id);
      console.error("Error inserting nodes from template:", insertNodesErr);
      return NextResponse.json({ error: insertNodesErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, flow_id: newFlow.id });
  } catch (err: any) {
    console.error("[POST /api/bots/templates/:key/activate] error:", err.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
