"use client";

import { useState } from "react";
import { ChevronDown, Store } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface StoreSummary {
  id: string;
  name: string;
  shopDomain: string | null;
  status: string;
}

export function StoreSwitcher() {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [listRes, currentRes] = await Promise.all([
        fetch("/api/v1/stores"),
        fetch("/api/v1/stores/current"),
      ]);
      if (listRes.ok) {
        const body = await listRes.json();
        setStores(body.data?.stores ?? []);
      }
      if (currentRes.ok) {
        const body = await currentRes.json();
        setActiveId(body.data?.store?.id ?? null);
        setStatus(body.data?.entitlements?.status ?? null);
        setPlan(body.data?.entitlements?.plan ?? null);
      } else if (currentRes.status === 403) {
        setActiveId(null);
      }
    } catch {
      setError("Could not load stores");
    }
  };

  const switchStore = async (storeId: string) => {
    if (storeId === activeId) return;
    setError(null);
    const res = await fetch("/api/v1/stores/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    if (!res.ok) {
      setError("You do not have access to that store");
      return;
    }
    window.location.reload();
  };

  const active = stores.find((s) => s.id === activeId);

  return (
    <div className="w-full">
      <DropdownMenu>
        <DropdownMenuTrigger
          onPointerDown={() => {
            void load();
          }}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus:outline-none"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Store className="size-4 shrink-0 text-primary" />
            <span className="truncate font-medium text-foreground">
              {active?.name || "Stores"}
            </span>
          </div>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56 border border-border bg-popover text-popover-foreground"
        >
          <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Stores
            {status ? ` · ${status}` : ""}
            {plan && plan !== "none" ? ` · ${plan}` : ""}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          {stores.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Connect a Shopify store to start a 7-day trial.
            </div>
          ) : (
            stores.map((store) => (
              <DropdownMenuItem
                key={store.id}
                onClick={() => void switchStore(store.id)}
                className={`cursor-pointer px-3 py-1.5 focus:bg-accent focus:text-accent-foreground ${
                  store.id === activeId ? "bg-accent/40 font-semibold" : ""
                }`}
              >
                <span className="truncate">{store.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <p className="mt-1 px-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
