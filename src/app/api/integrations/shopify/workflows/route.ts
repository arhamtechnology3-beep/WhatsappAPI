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

    // Fetch categories and templates
    const { data: categories, error: catsError } = await supabase
      .from("workflow_categories")
      .select("*")
      .order("display_order", { ascending: true });

    if (catsError) {
      return NextResponse.json({ error: catsError.message }, { status: 500 });
    }

    const { data: templates, error: tmplsError } = await supabase
      .from("workflow_templates")
      .select("*")
      .order("display_order", { ascending: true });

    if (tmplsError) {
      return NextResponse.json({ error: tmplsError.message }, { status: 500 });
    }

    // Fetch active merchant configurations for this account
    const { data: merchantWorkflows, error: mwError } = await supabase
      .from("merchant_workflows")
      .select("*")
      .eq("merchant_id", accountId);

    if (mwError) {
      return NextResponse.json({ error: mwError.message }, { status: 500 });
    }

    // Group templates by category
    const grouped = categories.map((cat) => {
      const catTemplates = templates
        .filter((t) => t.category_id === cat.id)
        .map((t) => {
          const mw = merchantWorkflows?.find((m) => m.workflow_template_id === t.id);
          return {
            id: t.id,
            key: t.key,
            name: t.name,
            description: t.description,
            trigger_event: t.trigger_event,
            default_message_template: t.default_message_template,
            delay_minutes: t.delay_minutes,
            meta_template_name: t.meta_template_name,
            status: mw ? mw.status : "not_configured",
            message_template: mw ? mw.message_template : t.default_message_template,
            config: mw ? mw.config : {},
          };
        });

      return {
        id: cat.id,
        key: cat.key,
        name: cat.name,
        icon: cat.icon,
        templates: catTemplates,
      };
    });

    return NextResponse.json({ categories: grouped });
  } catch (err: any) {
    console.error("[shopify-workflows] GET error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
