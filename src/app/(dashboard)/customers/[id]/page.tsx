"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { isIdentityFlowNavEnabled } from "@/lib/identityflow/flags";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const enabled = isIdentityFlowNavEnabled(profile?.beta_features);
  const [data, setData] = useState<{
    profile: Record<string, unknown>;
    timeline: Array<Record<string, unknown>>;
    consent: Array<Record<string, unknown>>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !params.id) return;
    fetch(`/api/v1/customers/${params.id}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.message || "Failed");
        setData(body.data);
      })
      .catch((err) => setError(err.message));
  }, [enabled, params.id]);

  if (!enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        IdentityFlow nav is disabled.{" "}
        <Link href="/dashboard" className="text-primary hover:underline">
          Dashboard
        </Link>
      </p>
    );
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const p = data.profile;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/customers" className="text-sm text-primary hover:underline">
        ← Customers
      </Link>
      <div>
        <h1 className="text-xl font-semibold">
          {(p.display_name as string) || "Customer"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Consent: {String(p.consent_status)} · Orders: {String(p.order_count)} ·
          LTV: {String(p.lifetime_value)}
        </p>
      </div>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </h2>
        <ul className="mt-2 space-y-2">
          {data.timeline.length === 0 ? (
            <li className="text-sm text-muted-foreground">No events yet.</li>
          ) : (
            data.timeline.map((e) => (
              <li
                key={String(e.id)}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">{String(e.event_name)}</span>
                <span className="ml-2 text-muted-foreground">
                  {String(e.occurred_at)}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Consent
        </h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.consent.map((c, i) => (
            <li key={i}>
              {String(c.purpose)}: {String(c.status)} ({String(c.recorded_at)})
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
