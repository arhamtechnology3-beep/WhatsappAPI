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
    const admin = supabaseAdmin();

    // Toggle flow status back to draft (i.e. inactive/stop responding)
    const { error: updateErr } = await admin
      .from("flows")
      .update({
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", accountId)
      .eq("template_key", key);

    if (updateErr) {
      console.error("Error deactivating flow:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/bots/templates/:key/deactivate] error:", err.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
