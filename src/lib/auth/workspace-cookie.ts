export const WORKSPACE_COOKIE = 'wacrm_active_workspace_id'
export const WORKSPACE_STORAGE_KEY = 'wacrm_active_workspace_id'

/** Must be readable by client JS so hard refresh can resolve accountId. */
export const workspaceCookieOptions = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax' as const,
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
}

export function hasSupabaseAuthCookie(
  cookies: { name: string }[],
): boolean {
  return cookies.some((c) => c.name.includes('-auth-token'))
}
