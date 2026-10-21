"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { X } from "lucide-react";

import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { StoreSwitcher } from "@/components/dashboard/store-switcher";
import { isIdentityFlowNavEnabled } from "@/lib/identityflow/flags";
import {
  ACCOUNT_NAV,
  WORKSPACE_NAV,
  isNavActive,
  visibleNavItems,
  type WorkspaceNavItem,
} from "@/lib/nav/workspace-nav";

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const identityFlowNav = isIdentityFlowNavEnabled(profile?.beta_features);
  const totalUnread = useTotalUnread();

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left.
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: static, always visible — reset all the mobile framing.
          "lg:static lg:z-0 lg:w-64 lg:translate-x-0 lg:transition-none",
        )}
        aria-label="Primary"
      >
        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img
              src="/logo-brand.png"
              alt="Arham Technology"
              className="h-11 w-auto object-contain"
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Store org switcher — top of sidebar so “Add another store”
            (and per-store WhatsApp) is obvious, not buried under nav. */}
        <div className="shrink-0 space-y-2 border-b border-sidebar-border px-3 py-3">
          <p className="px-1 text-[11px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
            Store & WhatsApp
          </p>
          <WorkspaceSwitcher />
          {identityFlowNav ? <StoreSwitcher /> : null}
        </div>

        {/* Main navigation — grouped by job so a new subscriber can
            scan Customers / Sales / Automate instead of one flat list. */}
        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Workspace">
          {WORKSPACE_NAV.map((group) => {
            const items = visibleNavItems(group.items, identityFlowNav);
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="mb-2">
                {group.id === "home" ? null : (
                  <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                    {group.label}
                  </p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {items.map((item) => (
                    <li key={item.href}>
                      <NavLink
                        item={item}
                        pathname={pathname}
                        totalUnread={totalUnread}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div className="my-2 border-t border-sidebar-border" />
          <p className="px-3 pt-1 pb-1 text-[11px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
            Account
          </p>
          <ul className="flex flex-col gap-0.5">
            {visibleNavItems(ACCOUNT_NAV, identityFlowNav).map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} totalUnread={0} />
              </li>
            ))}
          </ul>
        </nav>

      </aside>
    </>
  );
}

function NavLink({
  item,
  pathname,
  totalUnread,
}: {
  item: WorkspaceNavItem;
  pathname: string;
  totalUnread: number;
}) {
  const isActive = isNavActive(pathname, item.href);
  const showUnreadDot = item.href === "/inbox" && totalUnread > 0 && !isActive;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={item.description}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:py-2",
        isActive
          ? "bg-primary/15 text-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.beta ? (
        <span
          aria-label="Beta feature"
          className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300"
        >
          Beta
        </span>
      ) : null}
      {showUnreadDot ? (
        <span
          aria-label={`${totalUnread} unread conversation${totalUnread === 1 ? "" : "s"}`}
          className="relative flex h-2 w-2"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      ) : null}
    </Link>
  );
}
