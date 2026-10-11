export const STORE_COOKIE = "wacrm_active_store_id";

/** httpOnly — client JS must not set the active store. */
export const storeCookieOptions = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};
