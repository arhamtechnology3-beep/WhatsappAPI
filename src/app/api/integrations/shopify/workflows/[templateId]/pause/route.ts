import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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

    // Set status to 'paused'
    const { error: updateError } = await supabase
      .from("merchant_workflows")
      .update({
        status: "paused",
        updated_at: new Date().toISOString(),
      })
      .eq("merchant_id", accountId)
      .eq("workflow_template_id", templateId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[shopify-workflows-pause] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
