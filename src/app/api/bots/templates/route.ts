import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";

export async function GET() {
  try {
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

    // Fetch templates from database
    const { data: templates, error: templatesErr } = await supabase
      .from("bot_templates")
      .select("*")
      .order("name", { ascending: true });

    if (templatesErr) {
      console.error("Error fetching templates:", templatesErr);
      return NextResponse.json({ error: "Failed to fetch bot templates" }, { status: 500 });
    }

    // Fetch the merchant's flows linked to these templates
    const { data: merchantFlows } = await supabase
      .from("flows")
      .select("id, name, status, template_key, trigger_config, trigger_type")
      .eq("account_id", accountId)
      .not("template_key", "is", null);

    // For each template, count the runs in the last 7 days to show active stats
    const results = await Promise.all(
      templates.map(async (t) => {
        const flow = merchantFlows?.find((f) => f.template_key === t.key);
        const isActive = flow?.status === "active";

        let runsThisWeek = 0;
        if (flow) {
          // Query run counts for the last 7 days
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { count } = await supabase
            .from("flow_runs")
            .select("id", { count: "exact", head: true })
            .eq("flow_id", flow.id)
            .gte("started_at", sevenDaysAgo);

          runsThisWeek = count || 0;
        }

        return {
          id: t.id,
          key: t.key,
          name: t.name,
          description: t.description,
          category: t.category,
          thumbnail_url: t.thumbnail_url,
          flow_json: t.flow_json,
          is_active: isActive,
          flow_id: flow?.id || null,
          trigger_config: flow?.trigger_config || t.flow_json.trigger_config || {},
          runs_this_week: runsThisWeek,
        };
      })
    );

    return NextResponse.json({ templates: results });
  } catch (err: any) {
    console.error("[GET /api/bots/templates] error:", err.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
