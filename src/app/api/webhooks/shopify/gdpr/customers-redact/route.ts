import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { verifyShopifyWebhookSignature } from "@/lib/shopify/webhook-signature";
import {
  handleCustomersRedact,
  recordWebhookReceipt,
} from "@/lib/privacy/gdpr";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Shopify-Hmac-Sha256");
  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const shop = request.headers.get("x-shopify-shop-domain");
  const webhookId = request.headers.get("x-shopify-webhook-id");
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const receipt = await recordWebhookReceipt(supabase, {
    topic: "customers/redact",
    shopDomain: shop,
    webhookId,
    payload,
  });
  if (receipt.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const customer = (payload.customer ?? {}) as Record<string, unknown>;
    await handleCustomersRedact(supabase, {
      shopDomain: shop || String(payload.shop_domain || ""),
      shopifyCustomerId: customer.id != null ? String(customer.id) : null,
      email: typeof customer.email === "string" ? customer.email : null,
      phone: typeof customer.phone === "string" ? customer.phone : null,
    });
  } catch (err) {
    console.error("[gdpr/customers-redact]", err);
  }

  return NextResponse.json({ received: true });
}
