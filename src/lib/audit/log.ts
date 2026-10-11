import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEvent {
  organizationId?: string | null;
  storeId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

/** Best-effort audit insert. Never throws into the request path. */
export async function writeAuditLog(
  supabase: SupabaseClient,
  event: AuditEvent,
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      organization_id: event.organizationId ?? null,
      store_id: event.storeId ?? null,
      actor_user_id: event.actorUserId ?? null,
      action: event.action,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      metadata: event.metadata ?? {},
    });
    if (error) {
      console.error("[audit] insert failed", error.message);
    }
  } catch (err) {
    console.error("[audit] insert threw", err);
  }
}
