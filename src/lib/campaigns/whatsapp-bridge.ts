import type { SupabaseClient } from "@supabase/supabase-js";
import { canSendMarketing } from "@/lib/whatsapp/opt-in-helper";
import { incrementUsageCounter } from "@/lib/tracking/events";

/**
 * Bridge IdentityFlow campaign events → official Meta WhatsApp send queue.
 * Never scrapes WhatsApp Web; uses existing whatsapp_send_jobs.
 */
export async function enqueueCampaignWhatsApp(
  supabase: SupabaseClient,
  opts: {
    accountId: string;
    storeId: string;
    contactId: string;
    templateName: string;
    campaignId: string;
  },
): Promise<string | null> {
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, phone, account_id")
    .eq("id", opts.contactId)
    .eq("account_id", opts.accountId)
    .maybeSingle();

  if (!contact?.phone) return null;

  const allowed = await canSendMarketing(contact.id);
  if (!allowed) return null;

  const { data: job, error } = await supabase
    .from("whatsapp_send_jobs")
    .insert({
      account_id: opts.accountId,
      contact_id: contact.id,
      template_name: opts.templateName,
      template_params: [],
      status: "pending",
      run_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[campaign-whatsapp]", error.message);
    return null;
  }

  await incrementUsageCounter(supabase, {
    storeId: opts.storeId,
    organizationId: opts.accountId,
    field: "campaign_sends",
  });

  await supabase.from("audit_logs").insert({
    organization_id: opts.accountId,
    store_id: opts.storeId,
    action: "campaign.whatsapp_enqueue",
    resource_type: "campaign",
    resource_id: opts.campaignId,
    metadata: { jobId: job?.id, contactId: contact.id },
  });

  return job?.id ?? null;
}
