/**
 * Storefront IdentityFlow page/session tracking + browse/visit recovery.
 *
 * Default OFF: Free-plan Supabase was burned by every `page_view` writing
 * `tracking_events` / `visitor_sessions`. Classic abandoned-cart recovery
 * uses Shopify checkout webhooks → `shopify_checkouts` + 2h cron and does
 * not need this path.
 *
 * Opt back in (e.g. after VPS / paid quota): set `ENABLE_VISITOR_TRACKING=1`.
 */
export function isVisitorTrackingEnabled(
  raw: string | undefined = process.env.ENABLE_VISITOR_TRACKING,
): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}
