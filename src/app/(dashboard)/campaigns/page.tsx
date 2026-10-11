"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { isIdentityFlowNavEnabled } from "@/lib/identityflow/flags";
import { IdentityFlowGatedPage } from "@/components/identityflow/gated-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  frequency_cap: number;
  whatsapp_template_name: string | null;
}

export default function CampaignsPage() {
  const { profile, profileLoading } = useAuth();
  const enabled = isIdentityFlowNavEnabled(profile?.beta_features);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/v1/campaigns");
    const body = await res.json();
    if (!res.ok) throw new Error(body.error?.message || "Failed to load");
    setCampaigns(body.data?.campaigns ?? []);
  };

  useEffect(() => {
    if (!enabled) return;
    load().catch((err) => setError(err.message));
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
        title="Campaigns"
        description="Enable IdentityFlow nav to build popups and retention campaigns."
      />
    );
  }

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trigger: { type: "first_visit" },
          whatsappTemplateName: template.trim() || undefined,
          frequencyCap: 1,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || "Create failed");
      setName("");
      setTemplate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/v1/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error?.message || "Update failed");
      return;
    }
    await load();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Popup + WhatsApp retention. Frequency caps and consent are enforced
          server-side. Offer eligibility is never trusted from the browser.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row">
        <Input
          placeholder="Campaign name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder="WhatsApp template (optional)"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
        <Button disabled={busy || !name.trim()} onClick={() => void create()}>
          Create
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {campaigns.length === 0 ? (
          <li className="px-4 py-6 text-sm text-muted-foreground">
            No campaigns yet.
          </li>
        ) : (
          campaigns.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-muted-foreground">
                  {c.status} · cap {c.frequency_cap}
                  {c.whatsapp_template_name
                    ? ` · WA ${c.whatsapp_template_name}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {c.status !== "active" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(c.id, "active")}
                  >
                    Activate
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(c.id, "paused")}
                  >
                    Pause
                  </Button>
                )}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
