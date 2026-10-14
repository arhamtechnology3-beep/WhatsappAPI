/**
 * When to stop a recovery drip.
 *
 * Cart drips are keyed to the linked checkout only. A later order from
 * the same phone must not cancel a *different* open cart (one with none
 * of the ordered products).
 * Browse drips stop if that contact adds to cart or orders after the
 * browse session started.
 */

export function shouldStopCartDrip(checkoutStatus: string | null | undefined): boolean {
  return checkoutStatus === 'recovered'
}

type LineItemLike = { variant_id?: unknown; product_id?: unknown }

/**
 * Orders from Razorpay MagicCheckout carry no cart_token, so the open
 * checkout is matched by product instead: the order recovers it when it
 * contains any variant (or product, when variants are missing) from it.
 */
export function orderCoversCheckout(orderItems: unknown, checkoutItems: unknown): boolean {
  const list = (v: unknown): LineItemLike[] => (Array.isArray(v) ? v : [])
  const ids = (items: LineItemLike[], key: keyof LineItemLike) =>
    new Set(items.map((li) => li[key]).filter((id) => id != null && id !== '').map(String))
  const order = list(orderItems)
  const checkout = list(checkoutItems)
  if (order.length === 0 || checkout.length === 0) return false
  const orderVariants = ids(order, 'variant_id')
  const checkoutVariants = ids(checkout, 'variant_id')
  if (orderVariants.size && checkoutVariants.size) {
    return [...checkoutVariants].some((id) => orderVariants.has(id))
  }
  const orderProducts = ids(order, 'product_id')
  return [...ids(checkout, 'product_id')].some((id) => orderProducts.has(id))
}

export function shouldStopBrowseDrip(opts: {
  addedToCartAfterStart: boolean
  orderedAfterStart: boolean
}): boolean {
  return opts.addedToCartAfterStart || opts.orderedAfterStart
}
