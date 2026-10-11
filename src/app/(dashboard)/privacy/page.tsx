"use client";

import { useAuth } from "@/hooks/use-auth";
import { isIdentityFlowNavEnabled } from "@/lib/identityflow/flags";
import { IdentityFlowGatedPage } from "@/components/identityflow/gated-page";

export default function PrivacyPage() {
  const { profile, profileLoading } = useAuth();
  const enabled = isIdentityFlowNavEnabled(profile?.beta_features);

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
        title="Privacy"
        description="Enable IdentityFlow nav for data controls."
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Privacy and data controls</h1>
      <p className="text-sm text-muted-foreground">
        Shopify GDPR webhooks (`customers/data_request`, `customers/redact`,
        `shop/redact`) are HMAC-verified and recorded in `privacy_jobs`. Storefront
        tracking requires consent before events are accepted.
      </p>
      <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
        <p>
          SDK: <code className="text-xs">/identityflow/sdk.js</code>
        </p>
        <p>
          Popup helper: <code className="text-xs">/identityflow/popup.js</code>
        </p>
        <p>
          Ingest: <code className="text-xs">POST /api/v1/events/ingest</code>
        </p>
        <p>
          Optional signing secret:{" "}
          <code className="text-xs">STOREFRONT_INGEST_SECRET</code>
        </p>
        <p className="text-muted-foreground">
          Retention cron deletes tracking and campaign events older than 90 days
          via `/api/cron/identityflow` (also on `/api/cron/tick`).
        </p>
      </div>
    </div>
  );
}
