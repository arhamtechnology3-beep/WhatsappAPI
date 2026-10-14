import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { loadFollowupByToken, markReviewOpened } from '@/lib/followups/order-followups'
import { reviewUrl, reviewableProducts } from '@/lib/followups/plan'
import { storefrontBaseUrl } from '@/lib/shopify/whatsapp-template-library'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'Rate your order — DivyaPrabha Foods' },
}

const palette = {
  '--paper': '#FFF8E7',
  '--ink': '#3B2412',
  '--muted': '#7A5C43',
  '--turmeric': '#F9D801',
  '--line': '#EAD9B8',
} as React.CSSProperties

export default async function ReviewOrderPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const db = supabaseAdmin()
  const followup = await loadFollowupByToken(db, token)
  const products = followup ? reviewableProducts(followup.products) : []
  if (!followup || products.length === 0) redirect(storefrontBaseUrl())

  if (products.length === 1) {
    await markReviewOpened(db, followup, products[0].handle)
    redirect(reviewUrl(products[0].handle!))
  }

  return (
    <main
      style={palette}
      className="min-h-dvh bg-[var(--paper)] px-5 pb-12 pt-10 text-[var(--ink)]"
    >
      <div className="mx-auto max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          DivyaPrabha Foods
        </p>
        <h1 className="mt-3 font-serif text-3xl leading-tight">
          Aapka order kaisa laga?
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
          Order #{followup.order_number} mein {products.length} achaar the. Har ek ka review
          alag page pe khulega — ek likh kar wapas aayein aur agla rate karein.
        </p>

        <ol className="mt-8 space-y-4">
          {products.map((product, index) => {
            const opened = !!product.opened_at
            return (
              <li
                key={product.handle}
                className="relative rounded-2xl border-2 border-[var(--line)] bg-white p-4 shadow-[4px_4px_0_var(--line)]"
              >
                <div className="flex items-center gap-4">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--paper)] font-serif text-2xl">
                      {index + 1}
                    </span>
                  )}
                  <div className="min-w-0">
                    <h2 className="font-serif text-lg leading-snug">{product.title}</h2>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      {opened ? '✓ Review page khul gaya' : 'Abhi review baaki hai'}
                    </p>
                  </div>
                </div>
                <a
                  href={`/review/${token}/${encodeURIComponent(product.handle!)}`}
                  className={
                    opened
                      ? 'mt-4 block rounded-xl border-2 border-[var(--line)] py-3 text-center font-semibold text-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'
                      : 'mt-4 block rounded-xl bg-[var(--turmeric)] py-3 text-center font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'
                  }
                >
                  {opened ? 'Phir se kholein' : '⭐ Write a Review'}
                </a>
              </li>
            )
          })}
        </ol>

        <p className="mt-10 text-center text-sm text-[var(--muted)]">
          Dhanyawad 🙏 Aapka har review hamari didis tak pahunchta hai.
        </p>
      </div>
    </main>
  )
}
