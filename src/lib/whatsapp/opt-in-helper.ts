import { createClient } from "@supabase/supabase-js";

// Lazy-initialized admin client for background or API scoping
let _adminClient: any = null;
function getSupabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

/**
 * Checks if a contact has consented to receive marketing WhatsApp messages.
 * Returns true if marketing_opt_in is true AND marketing_opt_out_at is null.
 */
export async function canSendMarketing(contactId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("contacts")
      .select("marketing_opt_in, marketing_opt_out_at")
      .eq("id", contactId)
      .maybeSingle();

    if (error || !data) return false;

    return data.marketing_opt_in === true && data.marketing_opt_out_at === null;
  } catch (err) {
    console.error("[opt-in-helper] error checking canSendMarketing:", err);
    return false;
  }
}
