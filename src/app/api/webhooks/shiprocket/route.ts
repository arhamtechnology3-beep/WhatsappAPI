import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { sendTemplateMessage } from "@/lib/whatsapp/meta-api";
import { decrypt } from "@/lib/whatsapp/encryption";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let accountId = searchParams.get("account_id") || searchParams.get("accountId");
    const body = await request.json().catch(() => ({}));

    const supabase = supabaseAdmin();

    // 1. Resolve account_id if not in query parameter
    if (!accountId) {
      const { data: srConfigs } = await supabase
        .from("merchant_integrations")
        .select("account_id")
        .eq("integration_key", "shiprocket")
        .eq("status", "connected")
        .limit(1);

      if (srConfigs && srConfigs.length > 0) {
        accountId = srConfigs[0].account_id;
      }
    }

    if (!accountId) {
      console.warn("[Shiprocket Webhook] Received tracking event but no account_id could be resolved.");
      return NextResponse.json({ error: "Account ID not resolved" }, { status: 400 });
    }

    console.log(`[Shiprocket Webhook] Processing event for account ${accountId}:`, JSON.stringify(body, null, 2));

    const awb = body.awb || body.awb_number;
    const status = body.current_status || body.status;
    const courier = body.courier_name || body.courier;
    const rawPhone = body.customer_phone || body.phone || "";
    const orderId = body.order_id || "";

    let phone = rawPhone.replace(/\D/g, "");
    if (phone.length === 10) {
      phone = `91${phone}`;
    }

    if (phone && status) {
      // Fetch WhatsApp Config
      const { data: config } = await supabase
        .from("whatsapp_config")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();

      if (config?.access_token) {
        const accessToken = decrypt(config.access_token);
        try {
          // Trigger shipping update template
          await sendTemplateMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: phone,
            templateName: "wacrm_shipping_update",
            language: "en_US",
            params: [orderId, status, courier || "Logistics Partner", awb || ""],
          });
          console.log(`[Shiprocket Webhook] Successfully sent WhatsApp shipment status (${status}) for AWB ${awb} to ${phone}`);
        } catch (sendErr: any) {
          // Fallback to hello_world
          try {
            await sendTemplateMessage({
              phoneNumberId: config.phone_number_id,
              accessToken,
              to: phone,
              templateName: "hello_world",
              language: "en_us",
              params: [],
            });
            console.log(`[Shiprocket Webhook] Sent hello_world fallback template as wacrm_shipping_update was not approved`);
          } catch (fallbackErr: any) {
            console.error(`[Shiprocket Webhook] All template sends failed:`, fallbackErr.message || fallbackErr);
          }
        }
      }
    }

    return NextResponse.json({ success: true, awb, status });
  } catch (err: any) {
    console.error("[Shiprocket Webhook] error:", err.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
