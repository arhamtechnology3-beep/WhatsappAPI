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

    const { data: config, error: configError } = await supabase
      .from("whatsapp_config")
      .select("opt_in_prompt_text, opt_in_keywords, opt_out_keywords")
      .eq("account_id", accountId)
      .maybeSingle();

    if (configError) {
      return NextResponse.json({ error: configError.message }, { status: 500 });
    }

    return NextResponse.json({
      opt_in_prompt_text: config?.opt_in_prompt_text || "Want order updates & offers on WhatsApp? Reply YES to opt in, or STOP anytime to opt out.",
      opt_in_keywords: config?.opt_in_keywords || ["YES", "Y", "OPT IN", "START", "SUBSCRIBE", "हाँ", "હા"],
      opt_out_keywords: config?.opt_out_keywords || ["STOP", "UNSUBSCRIBE", "CANCEL", "STOPIT", "HALT", "REMOVE", "बन्द", "बंद करें", "बंद", "રોકો", "બંધ કરો", "બંધ"],
    });
  } catch (err: any) {
    console.error("[opt-in-config] GET error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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

    const { opt_in_prompt_text, opt_in_keywords, opt_out_keywords } = body;

    if (!opt_in_prompt_text?.trim()) {
      return NextResponse.json({ error: "Opt-in prompt text cannot be empty" }, { status: 400 });
    }

    if (!Array.isArray(opt_in_keywords) || opt_in_keywords.some(k => !k.trim())) {
      return NextResponse.json({ error: "Opt-in keywords must be a valid list of non-empty strings" }, { status: 400 });
    }

    if (!Array.isArray(opt_out_keywords) || opt_out_keywords.some(k => !k.trim())) {
      return NextResponse.json({ error: "Opt-out keywords must be a valid list of non-empty strings" }, { status: 400 });
    }

    // Clean keywords (trim and uppercase)
    const cleanedOptIn = opt_in_keywords.map(k => k.trim());
    const cleanedOptOut = opt_out_keywords.map(k => k.trim());

    // Update whatsapp_config
    const { error: updateError } = await supabase
      .from("whatsapp_config")
      .update({
        opt_in_prompt_text: opt_in_prompt_text.trim(),
        opt_in_keywords: cleanedOptIn,
        opt_out_keywords: cleanedOptOut,
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", accountId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      opt_in_prompt_text: opt_in_prompt_text.trim(),
      opt_in_keywords: cleanedOptIn,
      opt_out_keywords: cleanedOptOut,
    });
  } catch (err: any) {
    console.error("[opt-in-config] PATCH error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
