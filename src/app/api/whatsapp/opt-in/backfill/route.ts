import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
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

    // Calculate dynamic backfill statistics
    // 1. Opted In: marketing_opt_in = true AND marketing_opt_in_source = 'backfill_campaign'
    const { count: optedIn } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("marketing_opt_in", true)
      .eq("marketing_opt_in_source", "backfill_campaign");

    // 2. Opted Out (from prompt): opt_in_prompt_sent_at IS NOT NULL AND marketing_opt_in = false AND marketing_opt_out_at IS NOT NULL
    const { count: optedOut } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("marketing_opt_in", false)
      .not("opt_in_prompt_sent_at", "is", null)
      .not("marketing_opt_out_at", "is", null);

    // 3. No Response: opt_in_prompt_sent_at IS NOT NULL AND marketing_opt_in = false AND marketing_opt_out_at IS NULL
    const { count: noResponse } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("marketing_opt_in", false)
      .not("opt_in_prompt_sent_at", "is", null)
      .is("marketing_opt_out_at", null);

    // 4. Eligible (Not yet prompted): marketing_opt_in = false AND marketing_opt_out_at IS NULL AND opt_in_prompt_sent_at IS NULL
    const { count: eligible } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("marketing_opt_in", false)
      .is("marketing_opt_out_at", null)
      .is("opt_in_prompt_sent_at", null);

    const totalSent = (optedIn || 0) + (optedOut || 0) + (noResponse || 0);

    return NextResponse.json({
      stats: {
        optedIn: optedIn || 0,
        optedOut: optedOut || 0,
        noResponse: noResponse || 0,
        totalSent,
        eligible: eligible || 0,
      },
    });
  } catch (err: any) {
    console.error("[opt-in-backfill] GET error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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
    const body = await request.json().catch(() => ({}));
    const templateName = body.template_name || "wacrm_opt_in_v1";

    // 1. Query all eligible contacts: marketing_opt_in = false AND marketing_opt_out_at IS NULL AND opt_in_prompt_sent_at IS NULL
    const { data: contacts, error: fetchErr } = await supabase
      .from("contacts")
      .select("id, phone, name")
      .eq("account_id", accountId)
      .eq("marketing_opt_in", false)
      .is("marketing_opt_out_at", null)
      .is("opt_in_prompt_sent_at", null);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No eligible contacts found for backfill campaign." });
    }

    // 2. Queue WhatsApp send jobs for each eligible contact
    const jobs = contacts.map((c) => ({
      account_id: accountId,
      contact_id: c.id,
      recipient_phone: c.phone,
      template_name: templateName,
      template_params: [c.name || "Customer"],
      status: "pending",
      run_at: new Date().toISOString(),
    }));

    const { error: insertErr } = await supabase
      .from("whatsapp_send_jobs")
      .insert(jobs);

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // 3. Mark opt_in_prompt_sent_at for targeted contacts
    const contactIds = contacts.map((c) => c.id);
    const { error: updateErr } = await supabase
      .from("contacts")
      .update({
        opt_in_prompt_sent_at: new Date().toISOString(),
      })
      .in("id", contactIds);

    if (updateErr) {
      console.error("[opt-in-backfill] error updating contacts prompt timestamps:", updateErr.message);
    }

    return NextResponse.json({
      success: true,
      count: contacts.length,
    });
  } catch (err: any) {
    console.error("[opt-in-backfill] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
