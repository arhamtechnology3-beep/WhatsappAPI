import crypto from "node:crypto";

/** Timing-safe compare of Shopify OAuth query HMAC (hex). */
export function verifyShopifyOAuthHmac(
  searchParams: URLSearchParams,
  secret: string,
): boolean {
  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const params: string[] = [];
  searchParams.forEach((val, key) => {
    if (key !== "hmac") params.push(`${key}=${val}`);
  });
  params.sort();
  const message = params.join("&");
  const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");

  try {
    const a = Buffer.from(hmac, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createOAuthState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function oauthStateCookieOptions(secure: boolean) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    maxAge: 60 * 10,
  };
}

export const OAUTH_STATE_COOKIE = "wacrm_shopify_oauth_state";
