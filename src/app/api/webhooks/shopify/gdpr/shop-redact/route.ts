import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { verifyShopifyWebhookSignature } from "@/lib/shopify/webhook-signature";
import { handleShopRedact, recordWebhookReceipt } from "@/lib/privacy/gdpr";
import { markStoreUninstalled } from "@/lib/shopify/install-store";

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
    topic: "shop/redact",
    shopDomain: shop,
    webhookId,
    payload,
  });
  if (receipt.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const domain = shop || String(payload.shop_domain || "");
    if (domain) {
      await handleShopRedact(supabase, domain);
      await markStoreUninstalled(supabase, domain);
    }
  } catch (err) {
    console.error("[gdpr/shop-redact]", err);
  }

  return NextResponse.json({ received: true });
}
