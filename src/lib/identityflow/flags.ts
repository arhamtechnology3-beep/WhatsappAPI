/**
 * Incomplete IdentityFlow chrome (store switcher, Customer 360,
 * campaigns, billing, privacy) stays hidden until this flag is on.
 *
 * Enable globally with NEXT_PUBLIC_IDENTITYFLOW_NAV=true, or per user
 * by adding "identityflow" to profiles.beta_features.
 */
export const IDENTITYFLOW_NAV_FLAG = "identityflow";

export function isIdentityFlowNavEnabled(
  betaFeatures?: readonly string[] | null,
): boolean {
  if (process.env.NEXT_PUBLIC_IDENTITYFLOW_NAV === "true") return true;
  return Array.isArray(betaFeatures) && betaFeatures.includes(IDENTITYFLOW_NAV_FLAG);
}
