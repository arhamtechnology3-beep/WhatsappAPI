import { z } from "zod";
import { badRequest, ok, toApiErrorResponse } from "@/lib/api/v1/respond";
import { requireRole } from "@/lib/auth/account";
import { writeAuditLog } from "@/lib/audit/log";
import { isSupportGrantActive } from "@/lib/ops/retention";

const grantSchema = z.object({
  supportUserId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  reason: z.string().min(8).max(500),
  hours: z.number().int().min(1).max(72).optional(),
  storeId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .optional(),
});

/** Owner-only: time-limited support access. Never exposes secrets. */
export async function POST(request: Request) {
  try {
    const account = await requireRole("owner");
    const json = await request.json().catch(() => null);
    const parsed = grantSchema.safeParse(json);
    if (!parsed.success) throw badRequest("Invalid support grant");

    const hours = parsed.data.hours ?? 4;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const { data, error } = await account.supabase
      .from("support_access_grants")
      .insert({
        organization_id: account.accountId,
        store_id: parsed.data.storeId ?? null,
        granted_by: account.userId,
        support_user_id: parsed.data.supportUserId,
        reason: parsed.data.reason,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, expires_at, reason")
      .single();

    if (error) throw new Error(error.message);

    await writeAuditLog(account.supabase, {
      organizationId: account.accountId,
      storeId: parsed.data.storeId,
      actorUserId: account.userId,
      action: "support.grant",
      resourceType: "support_access_grant",
      resourceId: data.id,
      metadata: { hours, reason: parsed.data.reason },
    });

    return ok({
      grant: data,
      active: isSupportGrantActive({
        expiresAt,
        revokedAt: null,
        now: new Date(),
      }),
      note: "Support access never includes Shopify or WhatsApp tokens.",
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function GET() {
  try {
    const account = await requireRole("owner");
    const { data } = await account.supabase
      .from("support_access_grants")
      .select("id, support_user_id, reason, expires_at, revoked_at, created_at")
      .eq("organization_id", account.accountId)
      .order("created_at", { ascending: false })
      .limit(50);

    return ok({ grants: data ?? [] });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
