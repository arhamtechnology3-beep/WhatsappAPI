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
      // Fallback: look up first connected Razorpay merchant configuration
      const { data: rzpConfigs } = await supabase
        .from("merchant_integrations")
        .select("account_id")
        .eq("integration_key", "razorpay")
        .eq("status", "connected")
        .limit(1);

      if (rzpConfigs && rzpConfigs.length > 0) {
        accountId = rzpConfigs[0].account_id;
      }
    }

    if (!accountId) {
      console.warn("[Razorpay Webhook] Received event but no matching account_id could be resolved.");
      return NextResponse.json({ error: "Account ID not resolved" }, { status: 400 });
    }

    console.log(`[Razorpay Webhook] Processing event for account: ${accountId}`, JSON.stringify(body, null, 2));

    // 2. Identify Razorpay payment captured event
    const eventType = body.event;
    if (eventType === "payment.captured") {
      const payment = body.payload?.payment?.entity;
      if (payment) {
        const amountInRupees = (payment.amount / 100).toFixed(2);
        const currency = payment.currency || "INR";
        const rawPhone = payment.contact || "";
        const orderId = payment.order_id || payment.id;
        const email = payment.email || "";

        // Normalize phone number (digits only, strip country prefix if duplicate)
        let phone = rawPhone.replace(/\D/g, "");
        if (phone.length === 10) {
          phone = `91${phone}`; // Default to Indian country code
        }

        if (phone) {
          // Fetch WhatsApp Config
          const { data: config } = await supabase
            .from("whatsapp_config")
            .select("*")
            .eq("account_id", accountId)
            .maybeSingle();

          if (config?.access_token) {
            const accessToken = decrypt(config.access_token);
            try {
              // Trigger order confirmation template on WhatsApp
              await sendTemplateMessage({
                phoneNumberId: config.phone_number_id,
                accessToken,
                to: phone,
                templateName: "wacrm_payment_captured", // custom/standard template
                language: "en_US",
                params: [orderId, `${currency} ${amountInRupees}`],
              });
              console.log(`[Razorpay Webhook] Successfully sent WhatsApp payment alert for order ${orderId} to ${phone}`);
            } catch (sendErr: any) {
              // Fallback to hello_world or standard notification template
              try {
                await sendTemplateMessage({
                  phoneNumberId: config.phone_number_id,
                  accessToken,
                  to: phone,
                  templateName: "hello_world",
                  language: "en_us",
                  params: [],
                });
                console.log(`[Razorpay Webhook] Sent hello_world fallback template as wacrm_payment_captured was not approved`);
              } catch (fallbackErr: any) {
                console.error(`[Razorpay Webhook] All template sends failed:`, fallbackErr.message || fallbackErr);
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, event: eventType });
  } catch (err: any) {
    console.error("[Razorpay Webhook] error:", err.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
