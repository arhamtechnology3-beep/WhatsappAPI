import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Get current account_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: "No account associated with user" }, { status: 400 });
    }

    const accountId = profile.account_id;

    // Fetch all available integrations
    const { data: integrations, error: integrationsErr } = await supabase
      .from("integrations")
      .select("*")
      .order("name", { ascending: true });

    if (integrationsErr) {
      console.error("Error fetching integrations:", integrationsErr);
      return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 });
    }

    // Fetch merchant configurations for this account
    const { data: merchantConfigs, error: merchantConfigsErr } = await supabase
      .from("merchant_integrations")
      .select("*")
      .eq("account_id", accountId);

    if (merchantConfigsErr) {
      console.error("Error fetching merchant integrations:", merchantConfigsErr);
      return NextResponse.json({ error: "Failed to fetch merchant integrations" }, { status: 500 });
    }

    // Fetch generic webhooks for this account
    const { data: webhookEndpoints, error: webhooksErr } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("account_id", accountId)
      .eq("is_active", true);

    const connectionCount = webhooksErr ? 0 : (webhookEndpoints?.length || 0);

    // Map and join
    const results = integrations.map((integration) => {
      const merchantConfig = merchantConfigs?.find(
        (m) => m.integration_key === integration.key
      );

      // Clean up sensitive data before returning to frontend
      const cleanConfig = { ...(merchantConfig?.config || {}) };
      delete cleanConfig.encrypted_secret;
      delete cleanConfig.keySecret;
      delete cleanConfig.password;
      delete cleanConfig.clientSecret;

      return {
        ...integration,
        status: merchantConfig?.status || "disconnected",
        connection_label: merchantConfig?.connection_label || null,
        config: cleanConfig,
        connectionCount: integration.key === "generic_webhook" ? connectionCount : undefined,
        endpoints: integration.key === "generic_webhook" ? (webhookEndpoints || []) : undefined,
      };
    });

    return NextResponse.json({ integrations: results });
  } catch (err: any) {
    console.error("[GET /api/integrations] error:", err.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
