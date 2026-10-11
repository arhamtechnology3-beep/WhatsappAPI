import { ok, toApiErrorResponse } from "@/lib/api/v1/respond";
import { getCurrentStore, getStoreEntitlements } from "@/lib/auth/store";

export async function GET() {
  try {
    const ctx = await getCurrentStore();
    const entitlements = await getStoreEntitlements(ctx.store.id, ctx);
    return ok({
      store: ctx.store,
      storeRole: ctx.storeRole,
      entitlements,
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
