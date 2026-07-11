import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
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
      return NextResponse.json({ error: "No account associated with user" }, { status: 400 });
    }

    const accountId = profile.account_id;

    // Delete or update connection status
    const { error: updateErr } = await supabase
      .from("merchant_integrations")
      .update({
        status: "disconnected",
        config: {},
        connection_label: null,
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", accountId)
      .eq("integration_key", key);

    if (updateErr) {
      console.error("Error disconnecting integration:", updateErr);
      return NextResponse.json({ error: "Failed to disconnect integration" }, { status: 500 });
    }

    // Special cleanups for specific integrations
    if (key === "generic_webhook") {
      // Set all generic webhooks to inactive (or delete them)
      const { error: webhooksErr } = await supabase
        .from("webhook_endpoints")
        .delete()
        .eq("account_id", accountId);

      if (webhooksErr) {
        console.error("Error clearing webhook endpoints:", webhooksErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/integrations/disconnect] error:", err.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
