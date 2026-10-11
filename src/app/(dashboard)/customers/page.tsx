"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { isIdentityFlowNavEnabled } from "@/lib/identityflow/flags";
import { IdentityFlowGatedPage } from "@/components/identityflow/gated-page";

interface CustomerRow {
  id: string;
  display_name: string | null;
  consent_status: string;
  order_count: number;
  lifetime_value: number;
  last_seen_at: string | null;
  shopify_customer_id: string | null;
}

export default function CustomersPage() {
  const { profile, profileLoading } = useAuth();
  const enabled = isIdentityFlowNavEnabled(profile?.beta_features);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/v1/customers")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.message || "Failed to load");
        if (!cancelled) setCustomers(body.data?.customers ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (profileLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!enabled) {
    return (
      <IdentityFlowGatedPage
        title="Customer 360"
        description="Enable IdentityFlow nav to view store-scoped profiles."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Customer 360</h1>
        <p className="text-sm text-muted-foreground">
          Store-scoped profiles. Identity links use consented phone/email only —
          never IP or name matching.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No profiles yet. Install the storefront SDK and sync Shopify customers.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {customers.map((c) => (
            <li key={c.id}>
              <Link
                href={`/customers/${c.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50"
              >
                <span className="font-medium">
                  {c.display_name || c.shopify_customer_id || c.id.slice(0, 8)}
                </span>
                <span className="text-muted-foreground">
                  {c.consent_status} · {c.order_count} orders ·{" "}
                  {Number(c.lifetime_value || 0).toFixed(0)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
