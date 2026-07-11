import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { sendTemplateMessage } from "@/lib/whatsapp/meta-api";
import { decrypt } from "@/lib/whatsapp/encryption";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = supabaseAdmin();

    // 1. Fetch the generic webhook endpoint
    const { data: endpoint, error: endpointErr } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (endpointErr || !endpoint) {
      return NextResponse.json({ error: "Webhook endpoint not found or inactive" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));

    // Log the generic webhook event for troubleshooting
    console.log(`[Generic Webhook ${id}] Received payload:`, JSON.stringify(body, null, 2));

    // Support trigger: if body contains "to" and "templateName", send a template
    const to = body.to || body.phone;
    const templateName = body.templateName || body.template;
    const templateParams = body.params || body.variables || [];

    if (to && templateName) {
      // Fetch WhatsApp config for the endpoint's account
      const { data: config, error: configErr } = await supabase
        .from("whatsapp_config")
        .select("*")
        .eq("account_id", endpoint.account_id)
        .maybeSingle();

      if (configErr || !config?.access_token) {
        console.error(`[Generic Webhook ${id}] WhatsApp not configured for account ${endpoint.account_id}`);
        return NextResponse.json({ error: "WhatsApp connection not configured on target account" }, { status: 400 });
      }

      const accessToken = decrypt(config.access_token);

      try {
        await sendTemplateMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: to.toString().replace(/\D/g, ""), // keep only digits
          templateName,
          language: body.language || "en_US",
          params: Array.isArray(templateParams) ? templateParams.map(String) : [],
        });
        console.log(`[Generic Webhook ${id}] Sent template ${templateName} to ${to}`);
      } catch (sendErr: any) {
        console.error(`[Generic Webhook ${id}] Failed to send template:`, sendErr.message || sendErr);
        return NextResponse.json({ error: `Meta API Send Failed: ${sendErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "Webhook received successfully" });
  } catch (err: any) {
    console.error(`[Generic Webhook] error:`, err.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
