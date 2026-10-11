import { cookies } from "next/headers";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { badRequest, ok, toApiErrorResponse } from "@/lib/api/v1/respond";
import { ForbiddenError, getCurrentAccount } from "@/lib/auth/account";
import { getStoreEntitlements, loadAccessibleStoreForActor } from "@/lib/auth/store";
import { STORE_COOKIE, storeCookieOptions } from "@/lib/auth/store-cookie";

const bodySchema = z.object({
  storeId: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      "storeId must be a UUID",
    ),
});

export async function POST(request: Request) {
  try {
    const account = await getCurrentAccount();
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw badRequest("storeId must be a UUID");
    }

    const accessible = await loadAccessibleStoreForActor(
      account,
      parsed.data.storeId,
    );
    if (!accessible) {
      throw new ForbiddenError("Store is not in this organization");
    }

    const cookieStore = await cookies();
    cookieStore.set(STORE_COOKIE, accessible.store.id, storeCookieOptions);

    const entitlements = await getStoreEntitlements(accessible.store.id, account);
    await writeAuditLog(account.supabase, {
      organizationId: account.accountId,
      storeId: accessible.store.id,
      actorUserId: account.userId,
      action: "store.switch",
      resourceType: "store",
      resourceId: accessible.store.id,
    });

    return ok({
      store: accessible.store,
      storeRole: accessible.storeRole,
      entitlements,
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
