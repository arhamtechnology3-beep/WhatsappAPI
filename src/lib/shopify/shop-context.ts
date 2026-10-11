import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeShopDomain } from "./store-credentials";

export interface ShopifyShopContext {
  accountId: string;
  userId: string;
  storeId: string | null;
  organizationId: string;
  shopDomain: string;
}

/**
 * Resolve tenant by Shopify shop domain. Falls back to first WhatsApp-
 * configured account only when no store row exists (legacy single-tenant).
 */
export async function resolveShopifyShopContext(
  supabase: SupabaseClient,
  shopDomainHeader: string | null | undefined,
): Promise<ShopifyShopContext> {
  if (shopDomainHeader) {
    const shopDomain = normalizeShopDomain(shopDomainHeader);

    const { data: store } = await supabase
      .from("stores")
      .select("id, organization_id, shop_domain")
      .eq("shop_domain", shopDomain)
      .maybeSingle();

    if (store) {
      const { data: owner } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", store.organization_id)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();

      const { data: wa } = await supabase
        .from("whatsapp_config")
        .select("user_id")
        .eq("account_id", store.organization_id)
        .limit(1)
        .maybeSingle();

      return {
        accountId: store.organization_id,
        organizationId: store.organization_id,
        storeId: store.id,
        shopDomain,
        userId: owner?.user_id || wa?.user_id || "",
      };
    }
  }

  // Legacy fallback — env single-store installs without a stores row yet.
  const { data: wa } = await supabase
    .from("whatsapp_config")
    .select("account_id, user_id")
    .not("account_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (wa?.account_id) {
    return {
      accountId: wa.account_id,
      organizationId: wa.account_id,
      storeId: null,
      shopDomain: shopDomainHeader
        ? normalizeShopDomain(shopDomainHeader)
        : "",
      userId: wa.user_id || "",
    };
  }

  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, owner_user_id")
    .limit(1)
    .maybeSingle();

  if (error || !account) {
    throw new Error(
      "Failed to resolve Shopify shop context: " +
        (error?.message || "No accounts found."),
    );
  }

  return {
    accountId: account.id,
    organizationId: account.id,
    storeId: null,
    shopDomain: shopDomainHeader
      ? normalizeShopDomain(shopDomainHeader)
      : "",
    userId: account.owner_user_id,
  };
}
