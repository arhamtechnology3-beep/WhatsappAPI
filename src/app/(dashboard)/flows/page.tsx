"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Workflow,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  MessageSquare,
  PlayCircle,
  PauseCircle,
  Archive,
  Sparkles,
  Layers,
  ArrowRight,
  BookOpen,
  Info,
  RefreshCw,
} from "lucide-react";

import { useCan } from "@/hooks/use-can";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: { keywords?: string[] } | Record<string, unknown>;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
  is_ai_generated?: boolean;
  ai_requirement?: string | null;
  template_key?: string | null;
}

interface BotTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  thumbnail_url: string | null;
  is_active: boolean;
  flow_id: string | null;
  trigger_config: Record<string, any>;
  runs_this_week: number;
}

const STATUS_LABELS: Record<FlowRow["status"], string> = {
  draft: "Inactive",
  active: "Active",
  archived: "Archived",
};

const STATUS_COLORS: Record<FlowRow["status"], string> = {
  draft: "border-border bg-muted text-muted-foreground",
  active: "border-emerald-600/40 bg-emerald-500/10 text-emerald-300",
  archived: "border-border bg-muted/50 text-muted-foreground",
};

const CATEGORIES = {
  ecommerce: "E-commerce",
  support: "Customer Support",
  marketing: "Marketing & Growth",
  sales: "Sales & Presets",
};

export default function FlowsPage() {
  const router = useRouter();
  const canCreate = useCan("send-messages");

  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [templates, setTemplates] = useState<BotTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"my_bots" | "templates">("my_bots");

  // Flow Scratch Create Dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // AI Generator Dialog
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRequirement, setAiRequirement] = useState("");
  const [generating, setGenerating] = useState(false);

  const fetchFlows = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/flows");
      if (res.ok) {
        const json = await res.json();
        setFlows(json.flows ?? []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Couldn't load bots.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async (silent = false) => {
    if (!silent) setTemplatesLoading(true);
    try {
      const res = await fetch("/api/bots/templates");
      if (res.ok) {
        const json = await res.json();
        setTemplates(json.templates ?? []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlows();
    fetchTemplates();
  }, [fetchFlows, fetchTemplates]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          trigger_type: "keyword",
          trigger_config: { keywords: [] },
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const json = await res.json();
      setCreateOpen(false);
      setNewName("");
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create flow.");
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!aiRequirement.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/flows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement: aiRequirement.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "AI generation failed. Please try again.");
      } else {
        toast.success("AI Bot Flow generated successfully!");
        setAiOpen(false);
        setAiRequirement("");
        router.push(`/flows/${data.bot_id}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("AI flow builder experienced a network error.");
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleTemplate = async (template: BotTemplate) => {
    const action = template.is_active ? "deactivate" : "activate";
    setTemplatesLoading(true);

    try {
      const res = await fetch(`/api/bots/templates/${template.key}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        toast.success(
          template.is_active
            ? `Deactivated template: ${template.name}`
            : `Activated template: ${template.name}`
        );
        fetchFlows(true);
        fetchTemplates(true);
      } else {
        const data = await res.json();
        toast.error(data.error || `Failed to ${action} template.`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Template toggle request failed.");
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleDelete = async (flow: FlowRow) => {
    const yes = window.confirm(
      `Delete "${flow.name}"? Any active runs will end immediately.`
    );
    if (!yes) return;
    try {
      const res = await fetch(`/api/flows/${flow.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      // Re-fetch templates to update active statuses
      fetchTemplates(true);
      toast.success("Flow deleted.");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't delete flow.");
    }
  };

  const examplePrompts = [
    {
      chip: "Check order status by ID",
      prompt: "A bot that welcomes the customer, collects a 6-digit order ID using Ask Text, and routes them to a human handoff step."
    },
    {
      chip: "Recommend products by category",
      prompt: "A product recommender bot. Present quick replies for Healthy Snacks or Traditional Sweets, and print collections URLs based on response."
    },
    {
      chip: "COD Confirmation Check",
      prompt: "COD verification bot. Ask to Confirm or Cancel delivery using buttons, then tag the contact tag_cod_confirmed or tag_cod_cancelled."
    },
    {
      chip: "FAQ support menu",
      prompt: "An FAQ bot that lets customer select Shipping Info, Returns policy, or Speak to Agent from a sectioned list menu."
    }
  ];

  return (
    <div className="space-y-6 p-6 animate-in fade-in duration-200">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Workflow className="size-5 text-primary" />
              WhatsApp Chatbots
            </h1>
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
              Beta
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure branching conversational bots, trigger keywords, and automated customer routing options.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GatedButton
            canAct={canCreate}
            gateReason="create flows"
            variant="outline"
            onClick={() => setAiOpen(true)}
            className="border-border hover:bg-muted font-semibold text-xs flex items-center gap-1.5 h-9"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Create with AI
          </GatedButton>
          <GatedButton
            canAct={canCreate}
            gateReason="create flows"
            onClick={() => setCreateOpen(true)}
            className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs flex items-center gap-1.5 h-9 shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Create blank
          </GatedButton>
        </div>
      </header>

      {/* Tabs list */}
      <div className="flex items-center border-b border-border pb-px gap-4">
        <button
          onClick={() => setActiveTab("my_bots")}
          className={cn(
            "text-xs font-bold pb-2 transition-colors border-b-2 px-1 relative -bottom-[2px]",
            activeTab === "my_bots"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          My Bots ({flows.length})
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          className={cn(
            "text-xs font-bold pb-2 transition-colors border-b-2 px-1 relative -bottom-[2px]",
            activeTab === "templates"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Presets Library ({templates.length})
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : activeTab === "my_bots" ? (
        // My Bots Tab
        flows.length === 0 ? (
          <EmptyState
            onCreate={() => setCreateOpen(true)}
            onAI={() => setAiOpen(true)}
            canCreate={canCreate}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {flows.map((flow) => (
              <FlowCard
                key={flow.id}
                flow={flow}
                onEdit={() => router.push(`/flows/${flow.id}`)}
                onDelete={() => handleDelete(flow)}
              />
            ))}
          </div>
        )
      ) : (
        // Templates Tab
        <div className="space-y-4">
          {templatesLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Synchronizing presets...
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((tmpl) => (
              <Card
                className="bg-card/45 border-border flex flex-col justify-between"
                key={tmpl.key}
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">{tmpl.name}</span>
                        {tmpl.is_active && (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-semibold text-[9px] py-0 px-2 rounded-full">
                            Active
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground block font-medium capitalize">
                        {CATEGORIES[tmpl.category as keyof typeof CATEGORIES]}
                      </span>
                    </div>

                    {/* Toggle Switch */}
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={tmpl.is_active}
                        onChange={() => handleToggleTemplate(tmpl)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4.5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-primary" />
                    </label>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {tmpl.description}
                  </p>
                </div>

                <div className="border-t border-border/40 p-3 bg-muted/5 rounded-b-xl flex items-center justify-between text-[11px]">
                  <div>
                    {tmpl.is_active ? (
                      <span className="text-muted-foreground font-semibold block">
                        📈 {tmpl.runs_this_week} execution{tmpl.runs_this_week !== 1 && 's'} this week
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60 italic block">
                        Toggle switch to activate preset
                      </span>
                    )}
                  </div>
                  {tmpl.is_active && tmpl.flow_id && (
                    <button
                      onClick={() => router.push(`/flows/${tmpl.flow_id}`)}
                      className="text-primary font-bold hover:underline inline-flex items-center gap-0.5"
                    >
                      Customize
                      <ArrowRight className="size-3.5" />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* dialogs */}
      {/* Create Blank dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md bg-popover text-popover-foreground border-border">
          <DialogHeader>
            <DialogTitle className="font-bold text-base flex items-center gap-1.5">
              <Workflow className="size-4.5 text-primary" /> Create new flow
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Start building a branching, keyword-triggered bot conversation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-muted-foreground font-semibold text-xs">Flow Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Refund policy helper"
              className="bg-muted border-border text-foreground h-9 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
              className="hover:bg-muted text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              size="sm"
              className="bg-primary text-primary-foreground font-semibold text-xs"
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Create blank
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Bot Flow Generator Dialog */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-lg bg-popover text-popover-foreground border-border">
          <DialogHeader>
            <DialogTitle className="font-bold text-base flex items-center gap-1.5">
              <Sparkles className="size-4.5 text-primary" /> Create Bot with AI
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Describe the WhatsApp conversation tree you want in natural language. Claude will parse the logic and construct a complete draft graph.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-semibold text-xs">Bot Prompt / Requirement</Label>
              <textarea
                value={aiRequirement}
                onChange={(e) => setAiRequirement(e.target.value)}
                placeholder="e.g. Create a bot that asks for language preference, presents menu, collects email, and connects to support."
                rows={4}
                className="w-full rounded-md border border-border bg-muted text-foreground p-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-none"
              />
            </div>

            {/* Prompt Chips */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Examples</span>
              <div className="flex flex-wrap gap-2">
                {examplePrompts.map((p) => (
                  <button
                    key={p.chip}
                    type="button"
                    onClick={() => setAiRequirement(p.prompt)}
                    className="text-[11px] bg-muted/65 border border-border hover:border-primary/45 hover:bg-muted text-foreground/90 font-medium px-2.5 py-1 rounded-full transition-colors text-left"
                  >
                    💡 {p.chip}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAiOpen(false)}
              disabled={generating}
              className="hover:bg-muted text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateAI}
              disabled={!aiRequirement.trim() || generating}
              size="sm"
              className="bg-primary text-primary-foreground font-semibold text-xs"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Generating Flow...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate Flow
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  onCreate,
  onAI,
  canCreate,
}: {
  onCreate: () => void;
  onAI: () => void;
  canCreate: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/20 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted border border-border/80">
        <Workflow className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-sm font-bold text-foreground">
        No active bot flows yet
      </h2>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
        Configure conversation menus, FAQs, or customer routing flows. Let AI draft the design or start from a preset template!
      </p>
      <div className="mt-5 flex items-center gap-3">
        <GatedButton
          canAct={canCreate}
          gateReason="create flows"
          variant="outline"
          onClick={onAI}
          className="border-border hover:bg-muted text-xs font-semibold flex items-center gap-1"
        >
          <Sparkles className="size-3.5 text-primary" /> Create with AI
        </GatedButton>
        <GatedButton
          canAct={canCreate}
          gateReason="create flows"
          onClick={onCreate}
          className="bg-primary text-primary-foreground text-xs font-semibold shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" /> Start blank
        </GatedButton>
      </div>
    </div>
  );
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
}: {
  flow: FlowRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const triggerSummary = describeTrigger(flow);
  const StatusIcon =
    flow.status === "active"
      ? PlayCircle
      : flow.status === "archived"
        ? Archive
        : PauseCircle;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4 transition duration-150 hover:border-border/80 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Workflow className="h-4 w-4 shrink-0 text-primary mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-sm font-bold text-foreground leading-none">
                {flow.name}
              </h3>
              {flow.is_ai_generated && (
                <Badge className="bg-primary/5 text-primary border-none font-bold text-[9px] py-0 px-1.5 flex items-center gap-0.5 rounded">
                  <Sparkles className="size-2.5" /> AI
                </Badge>
              )}
            </div>
            {flow.template_key && (
              <span className="text-[10px] text-muted-foreground font-semibold block leading-none">
                Cloned from preset
              </span>
            )}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 gap-1 text-[9px] font-semibold py-0 px-2 rounded-full",
            STATUS_COLORS[flow.status]
          )}
        >
          <StatusIcon className="h-2.5 w-2.5" />
          {STATUS_LABELS[flow.status]}
        </Badge>
      </div>

      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground leading-relaxed flex-1">
        {flow.description || triggerSummary}
      </p>

      {flow.is_ai_generated && flow.ai_requirement && (
        <div className="mt-2.5 p-2 rounded bg-muted/40 border border-border/30 text-[10px] text-muted-foreground leading-relaxed italic">
          &ldquo;{flow.ai_requirement}&rdquo;
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 text-[10px] font-semibold text-muted-foreground border-b border-border/40 pb-3">
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3.5 w-3.5" />
          {flow.execution_count} execution{flow.execution_count !== 1 && 's'}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-8 text-xs font-semibold">
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-red-400 hover:bg-red-500/10 hover:text-red-300 h-8 text-xs font-semibold"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}

function describeTrigger(flow: FlowRow): string {
  if (flow.trigger_type === "keyword") {
    const keywords = Array.isArray(flow.trigger_config.keywords)
      ? (flow.trigger_config.keywords as string[])
      : [];
    if (keywords.length === 0) return "Triggers on keyword (none set)";
    return `Triggers on keyword: "${keywords.join('", "')}"`;
  }
  if (flow.trigger_type === "first_inbound_message") {
    return "Triggers on a contact's first inbound message";
  }
  return "Manual execution trigger";
}

// Custom UI Card fallback component
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border bg-card text-card-foreground shadow-xs", className)}>
      {children}
    </div>
  );
}
