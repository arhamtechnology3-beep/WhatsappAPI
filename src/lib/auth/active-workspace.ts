/**
 * Middleware must never copy tenant IDs from the query string into
 * cookies. Active org/store are set only by verified switch routes.
 */
export const UNTRUSTED_TENANT_QUERY_KEYS = [
  "workspace_id",
  "store_id",
  "organization_id",
] as const;

export function untrustedTenantQueryKeys(query: URLSearchParams): string[] {
  return UNTRUSTED_TENANT_QUERY_KEYS.filter((key) => query.has(key));
}

export function pickCookieTenantIds(opts: {
  query: URLSearchParams;
  cookieWorkspaceId?: string;
  cookieStoreId?: string;
}): {
  workspaceId: string | undefined;
  storeId: string | undefined;
  ignoredQueryKeys: string[];
} {
  return {
    workspaceId: opts.cookieWorkspaceId,
    storeId: opts.cookieStoreId,
    ignoredQueryKeys: untrustedTenantQueryKeys(opts.query),
  };
}
