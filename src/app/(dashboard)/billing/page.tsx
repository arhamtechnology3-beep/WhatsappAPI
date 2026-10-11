"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { IdentityFlowGatedPage } from "@/components/identityflow/gated-page";
import { isIdentityFlowNavEnabled } from "@/lib/identityflow/flags";
import { Button } from "@/components/ui/button";

interface PlanRow {
  plan_id: string;
  display_name: string;
  currency: string;
  monthly_price: number;
  trial_days: number;
}

interface Entitlements {
  storeId: string;
  status: string;
  plan: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
}

export default function BillingPage() {
  const { profile, profileLoading } = useAuth();
  const enabled = isIdentityFlowNavEnabled(profile?.beta_features);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const [plansRes, currentRes] = await Promise.all([
        fetch("/api/v1/billing/subscribe"),
        fetch("/api/v1/stores/current"),
      ]);
      if (cancelled) return;
      if (plansRes.ok) {
        const body = await plansRes.json();
        setPlans(body.data?.plans ?? []);
      }
      if (currentRes.ok) {
        const body = await currentRes.json();
        setStoreId(body.data?.store?.id ?? null);
        setEntitlements(body.data?.entitlements ?? null);
      }
    })();
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
        title="Billing"
        description="Enable IdentityFlow nav to manage per-store plans."
      />
    );
  }

  const subscribe = async (planId: string) => {
    if (!storeId) {
      setMessage("Connect a Shopify store first.");
      return;
    }
    setBusy(planId);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, planId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error?.message || "Billing request failed");
        return;
      }
      if (body.data?.confirmationUrl) {
        window.location.href = body.data.confirmationUrl;
        return;
      }
      setEntitlements(body.data?.entitlements ?? entitlements);
      setMessage("Subscription activated for this store.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-store plans with a 7-day trial. Prices come from the database — not
          this page. WhatsApp inbox is billed separately from IdentityFlow modules.
        </p>
      </div>

      {entitlements ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p>
            Status: <strong className="uppercase">{entitlements.status}</strong>
          </p>
          <p>
            Plan: <strong>{entitlements.plan}</strong>
          </p>
          <p className="text-muted-foreground">
            Campaigns: {entitlements.features.campaigns ? "on" : "locked"} · Events
            limit: {entitlements.limits.monthlyTrackedEvents}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No active store selected.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.plan_id}
            className="flex flex-col rounded-xl border border-border bg-card p-4"
          >
            <h2 className="font-semibold text-foreground">{plan.display_name}</h2>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {(plan.monthly_price / 100).toFixed(0)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {plan.currency}/mo
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {plan.trial_days}-day trial on first install
            </p>
            <Button
              className="mt-4"
              disabled={!!busy || entitlements?.plan === plan.plan_id}
              onClick={() => void subscribe(plan.plan_id)}
            >
              {busy === plan.plan_id
                ? "Working…"
                : entitlements?.plan === plan.plan_id
                  ? "Current"
                  : "Select"}
            </Button>
          </div>
        ))}
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
