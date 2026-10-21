"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isIdentityFlowNavEnabled } from "@/lib/identityflow/flags";
import {
  ACCOUNT_NAV,
  WORKSPACE_NAV,
  visibleNavItems,
  type WorkspaceNavItem,
} from "@/lib/nav/workspace-nav";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface FeatureHit extends WorkspaceNavItem {
  group: string;
}

const FeatureSearchContext = createContext<(() => void) | null>(null);

export function useFeatureSearch(): () => void {
  const open = useContext(FeatureSearchContext);
  if (!open) {
    throw new Error("useFeatureSearch must be used inside FeatureSearchProvider");
  }
  return open;
}

export function FeatureSearchButton({ className }: { className?: string }) {
  const openSearch = useFeatureSearch();

  return (
    <button
      type="button"
      onClick={openSearch}
      className={cn(
        "flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="truncate">Find a feature</span>
      <kbd className="ml-auto hidden rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
        ⌘K
      </kbd>
    </button>
  );
}

export function FeatureSearchProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile } = useAuth();
  const identityFlow = isIdentityFlowNavEnabled(profile?.beta_features);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const hits = useMemo<FeatureHit[]>(() => {
    const groups = [
      ...WORKSPACE_NAV.map((group) => ({
        label: group.label,
        items: visibleNavItems(group.items, identityFlow),
      })),
      { label: "Account", items: visibleNavItems(ACCOUNT_NAV, identityFlow) },
    ];
    const needle = query.trim().toLowerCase();
    const all = groups.flatMap((group) =>
      group.items.map((item) => ({ ...item, group: group.label })),
    );
    if (!needle) return all;
    return all.filter((item) =>
      `${item.label} ${item.description} ${item.howTo} ${item.group}`
        .toLowerCase()
        .includes(needle),
    );
  }, [identityFlow, query]);

  const openSearch = useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuery("");
        setActive(0);
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && hits[active]) {
      event.preventDefault();
      go(hits[active].href);
    }
  };

  return (
    <FeatureSearchContext.Provider value={openSearch}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="gap-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Find a feature</DialogTitle>
            <DialogDescription>
              Search every page in this workspace and open it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Find a feature, like inbox, broadcast, Shopify…"
              aria-label="Find a feature"
              aria-controls="feature-search-results"
              aria-activedescendant={hits[active] ? `feature-hit-${hits[active].href}` : undefined}
              className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul
            id="feature-search-results"
            role="listbox"
            aria-label="Features"
            className="max-h-80 overflow-y-auto p-2"
          >
            {hits.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing matches that. Try inbox, contacts, or Shopify.
              </li>
            ) : (
              hits.map((item, index) => {
                const Icon = item.icon;
                const selected = index === active;
                return (
                  <li key={item.href} role="presentation">
                    <button
                      id={`feature-hit-${item.href}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(item.href)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left",
                        selected ? "bg-primary/10 text-foreground" : "text-foreground",
                      )}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {item.group} · {item.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </FeatureSearchContext.Provider>
  );
}
