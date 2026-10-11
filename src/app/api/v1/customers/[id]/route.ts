import { ok, toApiErrorResponse } from "@/lib/api/v1/respond";
import { ForbiddenError, getCurrentAccount } from "@/lib/auth/account";
import { loadAccessibleStoreForActor } from "@/lib/auth/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const account = await getCurrentAccount();
    const { data: profile } = await account.supabase
      .from("customer_profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!profile) throw new ForbiddenError("Customer not found");
    const accessible = await loadAccessibleStoreForActor(
      account,
      profile.store_id,
    );
    if (!accessible) throw new ForbiddenError("Customer not found");

    const { data: events } = await account.supabase
      .from("tracking_events")
      .select("id, event_name, occurred_at, payload")
      .eq("store_id", profile.store_id)
      .eq("customer_profile_id", profile.id)
      .order("occurred_at", { ascending: false })
      .limit(50);

    const { data: consent } = await account.supabase
      .from("consent_records")
      .select("purpose, status, recorded_at, source")
      .eq("store_id", profile.store_id)
      .order("recorded_at", { ascending: false })
      .limit(20);

    return ok({
      profile,
      timeline: events ?? [],
      consent: consent ?? [],
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
