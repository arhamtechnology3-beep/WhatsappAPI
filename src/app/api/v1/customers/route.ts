import { ok, toApiErrorResponse } from "@/lib/api/v1/respond";
import { getCurrentStore } from "@/lib/auth/store";

export async function GET() {
  try {
    const ctx = await getCurrentStore();
    const { data, error } = await ctx.supabase
      .from("customer_profiles")
      .select(
        "id, shopify_customer_id, contact_id, display_name, consent_status, order_count, lifetime_value, last_order_at, first_seen_at, last_seen_at, created_at",
      )
      .eq("store_id", ctx.store.id)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return ok({ customers: data ?? [], storeId: ctx.store.id });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
