import { z } from "zod";
import { badRequest, ok, toApiErrorResponse } from "@/lib/api/v1/respond";
import { ForbiddenError, getCurrentAccount } from "@/lib/auth/account";
import {
  getCurrentStore,
  getStoreEntitlements,
  loadAccessibleStoreForActor,
} from "@/lib/auth/store";
import { writeAuditLog } from "@/lib/audit/log";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  storeId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .optional(),
  trigger: z.record(z.string(), z.unknown()).optional(),
  audience: z.record(z.string(), z.unknown()).optional(),
  frequencyCap: z.number().int().min(1).max(50).optional(),
  conversionEvent: z.string().optional(),
  consentRequired: z.boolean().optional(),
  whatsappTemplateName: z.string().optional(),
  variant: z
    .object({
      name: z.string().optional(),
      content: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export async function GET() {
  try {
    const ctx = await getCurrentStore();
    const { data, error } = await ctx.supabase
      .from("campaigns")
      .select("id, name, status, trigger, frequency_cap, conversion_event, whatsapp_template_name, created_at, updated_at")
      .eq("store_id", ctx.store.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return ok({ campaigns: data ?? [] });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const account = await getCurrentAccount();
    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) throw badRequest("Invalid campaign payload");

    let storeId = parsed.data.storeId;
    if (!storeId) {
      const current = await getCurrentStore();
      storeId = current.store.id;
    }

    const accessible = await loadAccessibleStoreForActor(account, storeId);
    if (!accessible) throw new ForbiddenError("Store is not in this organization");

    const entitlements = await getStoreEntitlements(storeId, account);
    if (!entitlements.features.campaigns) {
      throw new ForbiddenError("Campaigns require an active trial or subscription");
    }

    const { count } = await account.supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .neq("status", "archived");

    if ((count ?? 0) >= entitlements.limits.campaigns) {
      throw new ForbiddenError("Campaign limit reached for this plan");
    }

    const { data: campaign, error } = await account.supabase
      .from("campaigns")
      .insert({
        store_id: storeId,
        organization_id: account.accountId,
        name: parsed.data.name,
        status: "draft",
        trigger: parsed.data.trigger ?? { type: "first_visit" },
        audience: parsed.data.audience ?? {},
        frequency_cap: parsed.data.frequencyCap ?? 1,
        conversion_event: parsed.data.conversionEvent ?? "purchase_completed",
        consent_required: parsed.data.consentRequired ?? true,
        whatsapp_template_name: parsed.data.whatsappTemplateName ?? null,
      })
      .select("*")
      .single();

    if (error || !campaign) throw new Error(error?.message || "Create failed");

    await account.supabase.from("campaign_variants").insert({
      campaign_id: campaign.id,
      store_id: storeId,
      name: parsed.data.variant?.name ?? "A",
      weight: 100,
      content: parsed.data.variant?.content ?? {
        headline: parsed.data.name,
        body: "Welcome back — complete your purchase.",
        cta: "Shop now",
      },
    });

    await writeAuditLog(account.supabase, {
      organizationId: account.accountId,
      storeId,
      actorUserId: account.userId,
      action: "campaign.create",
      resourceType: "campaign",
      resourceId: campaign.id,
    });

    return ok({ campaign }, 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
