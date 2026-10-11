"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { IdentityFlowPlaceholder } from "@/components/identityflow/placeholder";
import { isIdentityFlowNavEnabled } from "@/lib/identityflow/flags";

export function IdentityFlowGatedPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
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
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          This IdentityFlow module is not enabled for your account.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <IdentityFlowPlaceholder title={title} description={description} />;
}
