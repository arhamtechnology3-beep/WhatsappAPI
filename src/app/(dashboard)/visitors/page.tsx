"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Eye, Link2, ShoppingCart, MousePointerClick } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Stats = {
  identification: {
    total: number;
    identified: number;
    rate: number;
    bySource: Record<string, number>;
  };
  funnel: Record<string, { sent: number; clicked: number; purchased: number }>;
  windowDays: number;
};

type Settings = {
  popup_enabled: boolean;
  popup_delay_seconds: number;
  offer_text: string;
  discount_code: string;
  whatsapp_number: string | null;
  browse_nudge_enabled: boolean;
  cart_nudge_enabled: boolean;
  visit_nudge_enabled: boolean;
  max_marketing_per_24h: number;
  browse_visit_cooldown_days: number;
  skip_recent_buyer_days: number;
  inactivity_min_minutes: number;
  inactivity_max_minutes: number;
};

type SessionRow = {
  id: string;
  visitor_id: string;
  session_start: string;
  last_activity_at?: string;
  pages_viewed_count: number;
  cart_events_count: number;
  last_page: string | null;
  associated_phone: string | null;
  contact_name: string | null;
  identity_source: string | null;
  is_identified: boolean;
};

export default function VisitorsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "settings">("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, setRes, visRes] = await Promise.all([
        fetch("/api/v1/visitors/stats"),
        fetch("/api/v1/visitors/settings"),
        fetch("/api/shopify/visitor-sessions"),
      ]);
      if (!sRes.ok) throw new Error("Failed to load stats");
      if (!setRes.ok) throw new Error("Failed to load settings");
      const sJson = await sRes.json();
      const setJson = await setRes.json();
      const visJson = visRes.ok ? await visRes.json() : { sessions: [] };
      setStats(sJson);
      setSettings(setJson.settings);
      setSessions(visJson.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/visitors/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      const j = await res.json();
      setSettings(j.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const ratePct = stats ? Math.round(stats.identification.rate * 1000) / 10 : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visitors</h1>
          <p className="text-sm text-muted-foreground">
            First-party recognition and WhatsApp recovery nudges
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === "overview" && "bg-muted font-medium",
              )}
              onClick={() => setTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === "settings" && "bg-muted font-medium",
              )}
              onClick={() => setTab("settings")}
            >
              Settings
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {tab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Eye className="h-4 w-4" /> Sessions (7d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {stats?.identification.total ?? "—"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Link2 className="h-4 w-4" /> Identified
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {stats?.identification.identified ?? "—"}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({ratePct}%)
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <ShoppingCart className="h-4 w-4" /> Nudges sent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {stats
                    ? (stats.funnel.cart?.sent || 0) +
                      (stats.funnel.browse?.sent || 0) +
                      (stats.funnel.visit?.sent || 0)
                    : "—"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MousePointerClick className="h-4 w-4" /> Link clicks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {stats
                    ? (stats.funnel.cart?.clicked || 0) +
                      (stats.funnel.browse?.clicked || 0) +
                      (stats.funnel.visit?.clicked || 0)
                    : "—"}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Identity sources (7d)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {stats && Object.keys(stats.identification.bySource).length ? (
                  Object.entries(stats.identification.bySource).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No links yet.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recovery funnel (7d)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {(["cart", "browse", "visit"] as const).map((t) => (
                  <div key={t} className="flex items-center justify-between gap-2">
                    <span className="capitalize text-muted-foreground">{t}</span>
                    <span>
                      {stats?.funnel[t]?.sent ?? 0} sent →{" "}
                      {stats?.funnel[t]?.clicked ?? 0} clicked →{" "}
                      {stats?.funnel[t]?.purchased ?? 0} bought
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent sessions</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Phone / contact</th>
                    <th className="py-2 pr-3 font-medium">Pages</th>
                    <th className="py-2 pr-3 font-medium">Cart</th>
                    <th className="py-2 font-medium">Last page</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 50).map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(s.last_activity_at || s.session_start).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        {s.is_identified ? (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                            {s.identity_source || "identified"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">anonymous</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {s.contact_name || s.associated_phone || "—"}
                      </td>
                      <td className="py-2 pr-3">{s.pages_viewed_count}</td>
                      <td className="py-2 pr-3">{s.cart_events_count}</td>
                      <td className="py-2 max-w-[220px] truncate text-muted-foreground">
                        {s.last_page || "—"}
                      </td>
                    </tr>
                  ))}
                  {!sessions.length && !loading && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        No sessions yet. Install the theme tracker to start collecting.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {tab === "settings" && settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capture & nudge settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="text-sm">WhatsApp unlock popup</span>
                <Switch
                  checked={settings.popup_enabled}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, popup_enabled: v })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="text-sm">Cart nudges</span>
                <Switch
                  checked={settings.cart_nudge_enabled}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, cart_nudge_enabled: v })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="text-sm">Browse nudges</span>
                <Switch
                  checked={settings.browse_nudge_enabled}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, browse_nudge_enabled: v })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="text-sm">Visit nudges</span>
                <Switch
                  checked={settings.visit_nudge_enabled}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, visit_nudge_enabled: v })
                  }
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="offer">Offer text</Label>
                <Input
                  id="offer"
                  value={settings.offer_text}
                  onChange={(e) =>
                    setSettings({ ...settings, offer_text: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Discount code</Label>
                <Input
                  id="code"
                  value={settings.discount_code}
                  onChange={(e) =>
                    setSettings({ ...settings, discount_code: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wa">WhatsApp number (digits)</Label>
                <Input
                  id="wa"
                  value={settings.whatsapp_number || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      whatsapp_number: e.target.value.replace(/\D/g, "") || null,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delay">Popup delay (seconds)</Label>
                <Input
                  id="delay"
                  type="number"
                  value={settings.popup_delay_seconds}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      popup_delay_seconds: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max24">Max marketing / 24h</Label>
                <Input
                  id="max24"
                  type="number"
                  value={settings.max_marketing_per_24h}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      max_marketing_per_24h: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cool">Browse/visit cooldown (days)</Label>
                <Input
                  id="cool"
                  type="number"
                  value={settings.browse_visit_cooldown_days}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      browse_visit_cooldown_days: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <Button onClick={saveSettings} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
