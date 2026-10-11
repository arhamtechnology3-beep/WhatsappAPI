import { z } from "zod";
import { badRequest, ok, toApiErrorResponse } from "@/lib/api/v1/respond";
import { ForbiddenError, getCurrentAccount } from "@/lib/auth/account";
import { getStoreEntitlements, loadAccessibleStoreForActor } from "@/lib/auth/store";
import { writeAuditLog } from "@/lib/audit/log";
import { enqueueCampaignWhatsApp } from "@/lib/campaigns/whatsapp-bridge";

const patchSchema = z.object({
  status: z.enum(["draft", "scheduled", "active", "paused", "archived"]).optional(),
  name: z.string().min(1).max(120).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const account = await getCurrentAccount();
    const { data: campaign, error } = await account.supabase
      .from("campaigns")
      .select("*, campaign_variants(*)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!campaign) throw new ForbiddenError("Campaign not found");

    const accessible = await loadAccessibleStoreForActor(
      account,
      campaign.store_id,
    );
    if (!accessible) throw new ForbiddenError("Campaign not found");

    return ok({ campaign });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const account = await getCurrentAccount();
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) throw badRequest("Invalid patch");

    const { data: campaign } = await account.supabase
      .from("campaigns")
      .select("id, store_id, status")
      .eq("id", id)
      .maybeSingle();

    if (!campaign) throw new ForbiddenError("Campaign not found");
    const accessible = await loadAccessibleStoreForActor(
      account,
      campaign.store_id,
    );
    if (!accessible) throw new ForbiddenError("Campaign not found");

    if (parsed.data.status === "active") {
      const entitlements = await getStoreEntitlements(campaign.store_id, account);
      if (!entitlements.features.campaigns) {
        throw new ForbiddenError("Campaigns require an active trial or subscription");
      }
    }

    const { data: updated, error } = await account.supabase
      .from("campaigns")
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await writeAuditLog(account.supabase, {
      organizationId: account.accountId,
      storeId: campaign.store_id,
      actorUserId: account.userId,
      action: "campaign.update",
      resourceType: "campaign",
      resourceId: id,
      metadata: parsed.data,
    });

    return ok({ campaign: updated });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

/** Record impression/conversion and optionally enqueue WhatsApp. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const account = await getCurrentAccount();
    const body = await request.json().catch(() => ({}));
    const eventName = typeof body.eventName === "string" ? body.eventName : "popup_viewed";
    const eventId =
      typeof body.eventId === "string" ? body.eventId : `evt_${Date.now()}`;

    const { data: campaign } = await account.supabase
      .from("campaigns")
      .select("id, store_id, organization_id, status, whatsapp_template_name, consent_required")
      .eq("id", id)
      .maybeSingle();

    if (!campaign) throw new ForbiddenError("Campaign not found");
    const accessible = await loadAccessibleStoreForActor(
      account,
      campaign.store_id,
    );
    if (!accessible) throw new ForbiddenError("Campaign not found");

    await account.supabase.from("campaign_events").upsert(
      {
        campaign_id: id,
        store_id: campaign.store_id,
        event_name: eventName,
        visitor_id: typeof body.visitorId === "string" ? body.visitorId : null,
        event_id: eventId,
        metadata: body.metadata ?? {},
      },
      { onConflict: "store_id,event_id", ignoreDuplicates: true },
    );

    let whatsappJobId: string | null = null;
    if (
      eventName === "campaign_converted" ||
      eventName === "popup_viewed"
    ) {
      if (campaign.whatsapp_template_name && body.contactId) {
        whatsappJobId = await enqueueCampaignWhatsApp(account.supabase, {
          accountId: campaign.organization_id,
          storeId: campaign.store_id,
          contactId: String(body.contactId),
          templateName: campaign.whatsapp_template_name,
          campaignId: id,
        });
      }
    }

    return ok({ recorded: true, whatsappJobId });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
