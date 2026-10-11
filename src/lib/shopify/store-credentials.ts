import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/whatsapp/encryption";

export interface ShopifyCredentials {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
  storeId?: string;
  organizationId?: string;
  source: "store" | "env";
}

function normalizeShopDomain(domain: string): string {
  let clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  if (clean === "divyaprabhafoods.com" || clean === "www.divyaprabhafoods.com") {
    clean = "divyaprabhafoods.myshopify.com";
  }
  return clean;
}

function envCredentials(): ShopifyCredentials | null {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const accessToken = process.env.SHOPIFY_ADMIN_API_TOKEN?.trim();
  if (!storeDomain || !accessToken) return null;
  return {
    shopDomain: normalizeShopDomain(storeDomain),
    accessToken,
    apiVersion: process.env.SHOPIFY_API_VERSION || "2025-01",
    source: "env",
  };
}

/**
 * Prefer encrypted per-store token; fall back to host env for the
 * single-tenant Divya Prabha deploy until every call site is cut over.
 */
export async function resolveStoreCredentials(
  supabase: SupabaseClient,
  opts: { storeId?: string; shopDomain?: string },
): Promise<ShopifyCredentials> {
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2025-01";

  if (opts.storeId) {
    const { data } = await supabase
      .from("shopify_connections")
      .select(
        "store_id, organization_id, shop_domain, encrypted_access_token, uninstalled_at",
      )
      .eq("store_id", opts.storeId)
      .maybeSingle();

    if (data?.encrypted_access_token && !data.uninstalled_at) {
      return {
        shopDomain: normalizeShopDomain(data.shop_domain),
        accessToken: decrypt(data.encrypted_access_token),
        apiVersion,
        storeId: data.store_id,
        organizationId: data.organization_id,
        source: "store",
      };
    }
  }

  if (opts.shopDomain) {
    const domain = normalizeShopDomain(opts.shopDomain);
    const { data } = await supabase
      .from("shopify_connections")
      .select(
        "store_id, organization_id, shop_domain, encrypted_access_token, uninstalled_at",
      )
      .eq("shop_domain", domain)
      .is("uninstalled_at", null)
      .maybeSingle();

    if (data?.encrypted_access_token) {
      return {
        shopDomain: normalizeShopDomain(data.shop_domain),
        accessToken: decrypt(data.encrypted_access_token),
        apiVersion,
        storeId: data.store_id,
        organizationId: data.organization_id,
        source: "store",
      };
    }
  }

  const env = envCredentials();
  if (env) return env;

  throw new Error(
    "No Shopify credentials: connect a store or set SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_API_TOKEN",
  );
}

export { normalizeShopDomain, envCredentials };
