import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activateVerifiedSubscription } from "@/lib/billing/shopify-billing";
import { STORE_COOKIE, storeCookieOptions } from "@/lib/auth/store-cookie";
import { cookies } from "next/headers";

/**
 * Return URL after merchant approves a Shopify App Subscription.
 * charge_id / chargeId may be present depending on API version.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");
  const planId = searchParams.get("planId") || "growth";
  const chargeId =
    searchParams.get("charge_id") ||
    searchParams.get("chargeId") ||
    searchParams.get("subscription_id");

  if (!storeId) {
    return NextResponse.redirect(new URL("/billing?error=missing_store", request.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id, organization_id")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) {
    return NextResponse.redirect(new URL("/billing?error=store", request.url));
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", store.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.redirect(new URL("/billing?error=forbidden", request.url));
  }

  await activateVerifiedSubscription(supabase, {
    storeId: store.id,
    organizationId: store.organization_id,
    planId,
    shopifySubscriptionId: chargeId,
  });

  const cookieStore = await cookies();
  cookieStore.set(STORE_COOKIE, store.id, storeCookieOptions);

  return NextResponse.redirect(new URL("/billing?activated=1", request.url));
}
