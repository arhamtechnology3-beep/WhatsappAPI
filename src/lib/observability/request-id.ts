export const REQUEST_ID_HEADER = "x-request-id";

/** Web Crypto, not node:crypto — middleware runs on the Edge runtime. */
export function resolveRequestId(request: Request): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER)?.trim();
  return incoming && incoming.length > 0 ? incoming : globalThis.crypto.randomUUID();
}

export function requestIdHeaders(requestId: string): Record<string, string> {
  return { [REQUEST_ID_HEADER]: requestId };
}
