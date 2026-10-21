"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isIdentityFlowNavEnabled } from "@/lib/identityflow/flags";
import {
  ACCOUNT_NAV,
  WORKSPACE_NAV,
  visibleNavItems,
  type WorkspaceNavItem,
} from "@/lib/nav/workspace-nav";

const START_HERE: {
  step: string;
  title: string;
  body: string;
  href: string;
  action: string;
}[] = [
  {
    step: "01",
    title: "Connect WhatsApp",
    body: "Link the business number in Settings. Nothing sends until this is done.",
    href: "/settings?tab=whatsapp",
    action: "Open WhatsApp settings",
  },
  {
    step: "02",
    title: "Add customers",
    body: "Enter one person, or import a spreadsheet. This is the list broadcasts and deals use.",
    href: "/contacts",
    action: "Open contacts",
  },
  {
    step: "03",
    title: "Message them",
    body: "Reply in the Inbox. Use Broadcasts when one approved template should go to many people.",
    href: "/inbox",
    action: "Open inbox",
  },
];

function FeatureCard({ item }: { item: WorkspaceNavItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="group flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-card-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        {item.beta ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Beta
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        )}
      </span>
      <span className="mt-4 text-sm font-semibold text-foreground">{item.label}</span>
      <span className="mt-1 text-sm leading-snug text-muted-foreground">
        {item.description}
      </span>
    </Link>
  );
}

export function FeatureDirectory() {
  const { profile } = useAuth();
  const identityFlow = isIdentityFlowNavEnabled(profile?.beta_features);
  const accountItems = visibleNavItems(ACCOUNT_NAV, identityFlow);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Start here</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Three steps. After these, every other page is a specific job.
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {START_HERE.map((step) => (
          <li key={step.step} className="rounded-2xl border border-border bg-card p-4">
            <p className="font-mono text-xs font-semibold tracking-wider text-primary">
              {step.step}
            </p>
            <h3 className="mt-2 text-sm font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">{step.body}</p>
            <Link
              href={step.href}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {step.action}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </li>
        ))}
      </ol>

      <div className="pt-2">
        <h2 className="text-base font-semibold text-foreground">Every feature</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The same groups as the left menu. Open the one that matches the job.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {WORKSPACE_NAV.filter((group) => group.id !== "home").map((group) => {
          const items = visibleNavItems(group.items, identityFlow);
          if (items.length === 0) return null;
          return (
            <section key={group.id} className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="px-1 pt-1 pb-3">
                <h3 className="text-[11px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                  {group.label}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{group.summary}</p>
              </div>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((item) => (
                  <li key={item.href}>
                    <FeatureCard item={item} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-border bg-muted/30 p-3">
        <div className="px-1 pt-1 pb-3">
          <h3 className="text-[11px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
            Account
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The number, the team, and how the workspace is set up.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accountItems.map((item) => (
            <li key={item.href}>
              <FeatureCard item={item} />
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
