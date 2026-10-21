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
  max_organizations?: number;
}

interface Entitlements {
  storeId: string;
  status: string;
  plan: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
}

interface OrgRow {
  id: string;
  name: string;
  shopDomain: string | null;
  whatsappConnected: boolean;
}

interface SubscriptionSummary {
  status: string;
  planId: string;
  maxOrganizations: number;
  ownedOrganizations: number;
  trialEnd: string | null;
}

export default function BillingPage() {
  const { profile, profileLoading } = useAuth();
  const enabled = isIdentityFlowNavEnabled(profile?.beta_features);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [organizations, setOrganizations] = useState<OrgRow[]>([]);
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
        setSubscription(body.data?.subscription ?? null);
        setOrganizations(body.data?.organizations ?? []);
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
        description="Enable IdentityFlow nav to manage your plan across store organizations."
      />
    );
  }

  const subscribe = async (planId: string) => {
    if (!storeId) {
      setMessage("Connect a Shopify store in this organization first.");
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
      setMessage("Subscription activated for your login — all your store organizations share this plan.");
      const refresh = await fetch("/api/v1/billing/subscribe");
      if (refresh.ok) {
        const refreshed = await refresh.json();
        setSubscription(refreshed.data?.subscription ?? null);
        setOrganizations(refreshed.data?.organizations ?? []);
      }
    } finally {
      setBusy(null);
    }
  };

  const status = subscription?.status ?? entitlements?.status ?? "—";
  const planName = subscription?.planId ?? entitlements?.plan ?? "none";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One subscription per login. Each Shopify store is a separate organization
          with its own WhatsApp number. Prices come from the database — not this page.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-1">
        <p>
          Status: <strong className="uppercase">{status}</strong>
        </p>
        <p>
          Plan: <strong>{planName}</strong>
        </p>
        {subscription ? (
          <p className="text-muted-foreground">
            Store organizations: {subscription.ownedOrganizations} of{" "}
            {subscription.maxOrganizations}
          </p>
        ) : null}
        {entitlements ? (
          <p className="text-muted-foreground">
            Campaigns: {entitlements.features.campaigns ? "on" : "locked"} · Events
            limit: {entitlements.limits.monthlyTrackedEvents}
          </p>
        ) : null}
      </div>

      {organizations.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Your stores</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {organizations.map((org) => (
              <li
                key={org.id}
                className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {org.shopDomain || "No Shopify store connected"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  WhatsApp: {org.whatsappConnected ? "connected" : "not connected"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No store organizations yet. Use the workspace switcher to add one.
        </p>
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
              {plan.trial_days}-day trial · up to{" "}
              {plan.max_organizations ?? "—"} store
              {(plan.max_organizations ?? 0) === 1 ? "" : "s"}
            </p>
            <Button
              className="mt-4"
              disabled={!!busy || planName === plan.plan_id}
              onClick={() => void subscribe(plan.plan_id)}
            >
              {busy === plan.plan_id
                ? "Working…"
                : planName === plan.plan_id
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
