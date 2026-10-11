"use client";

import Link from "next/link";
import { getProductName } from "@/lib/identityflow/product";

export function IdentityFlowPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const product = getProductName();
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {product}
      </p>
      <h1 className="mt-1 text-xl font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        Paid modules stay locked until a store trial or verified subscription
        is active. WhatsApp inbox and cart recovery are unchanged.
      </p>
      <Link
        href="/shopify"
        className="mt-6 inline-flex text-sm font-medium text-primary hover:underline"
      >
        Open Shopify recovery
      </Link>
    </div>
  );
}
