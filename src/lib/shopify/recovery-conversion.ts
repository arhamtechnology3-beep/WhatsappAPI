/**
 * When to stop a recovery drip.
 *
 * Cart drips are keyed to the linked checkout only. A later order from
 * the same phone must not cancel a *different* open cart.
 * Browse drips stop if that contact adds to cart or orders after the
 * browse session started.
 */

export function shouldStopCartDrip(checkoutStatus: string | null | undefined): boolean {
  return checkoutStatus === 'recovered'
}

export function shouldStopBrowseDrip(opts: {
  addedToCartAfterStart: boolean
  orderedAfterStart: boolean
}): boolean {
  return opts.addedToCartAfterStart || opts.orderedAfterStart
}
