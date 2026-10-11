/** Configurable product name. Default matches the IdentityFlow spec. */
export function getProductName(): string {
  const fromEnv = process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : "IdentityFlow";
}
