import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: "No account associated with user" }, { status: 400 });
    }

    const accountId = profile.account_id;

    // Fetch the template details
    const { data: template, error: tmplError } = await supabase
      .from("workflow_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle();

    if (tmplError || !template) {
      return NextResponse.json({ error: "Workflow template not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const messageTemplate = body.message_template || template.default_message_template;
    const config = body.config || {};

    // Get current status if exists
    const { data: existing } = await supabase
      .from("merchant_workflows")
      .select("status")
      .eq("merchant_id", accountId)
      .eq("workflow_template_id", templateId)
      .maybeSingle();

    const status = existing?.status || "configured";

    // Upsert merchant workflow
    const { error: upsertError } = await supabase
      .from("merchant_workflows")
      .upsert(
        {
          merchant_id: accountId,
          workflow_template_id: templateId,
          status,
          message_template: messageTemplate,
          config,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "merchant_id,workflow_template_id" }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[shopify-workflows-patch] PATCH error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
