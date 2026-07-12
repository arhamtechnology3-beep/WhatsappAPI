"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
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
  ArrowRight,
  ChevronRight,
  ChevronDown,
  ShoppingBag,
  Info,
  Package,
  Truck,
  CreditCard,
  Settings,
  ListFilter,
  CheckCircle,
  Calendar,
  User,
  AlertCircle,
  ChevronLeft,
  X,
  ExternalLink,
  MoreVertical,
  HelpCircle,
  Send,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface WorkflowTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  trigger_event: string;
  default_message_template: string;
  delay_minutes: number | null;
  status: "not_configured" | "configured" | "active" | "paused";
  message_template: string;
  config: Record<string, any>;
  meta_template_name: string;
}

interface WorkflowCategory {
  id: string;
  key: string;
  name: string;
  icon: string;
  templates: WorkflowTemplate[];
}

interface WorkflowLog {
  id: string;
  workflow_name: string;
  contact_name: string;
  contact_phone: string;
  status: "pending" | "sent" | "failed" | "delivered" | "read";
  error_message: string | null;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, any> = {
  abandoned_cart: ShoppingBag,
  order: Package,
  fulfillment_tracking: Truck,
  payment_refund: CreditCard,
};

const LOG_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  sent: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  failed: "bg-red-500/10 text-red-300 border-red-500/20",
  delivered: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  read: "bg-purple-500/10 text-purple-300 border-purple-500/20",
};

export default function ShopifyIntegrationPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "config" | "workflows" | "logs">("overview");

  // Integration config states
  const [brandName, setBrandName] = useState("");
  const [publicShopUrl, setPublicShopUrl] = useState("");
  const [shopUrl, setShopUrl] = useState("");
  const [configLoading, setConfigLoading] = useState(true);
  const [updatingConfig, setUpdatingConfig] = useState(false);

  // Workflows states
  const [categories, setCategories] = useState<WorkflowCategory[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    abandoned_cart: true,
  });

  // Drawer states
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [editedMessage, setEditedMessage] = useState("");
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Logs states
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Load configuration
  const fetchConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      const res = await fetch("/api/integrations/shopify/config");
      if (res.ok) {
        const data = await res.json();
        setBrandName(data.brand_name || "");
        setPublicShopUrl(data.public_shop_url || "");
        setShopUrl(data.shop_url || "");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load Shopify configurations.");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  // Update configuration
  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingConfig(true);
    try {
      const res = await fetch("/api/integrations/shopify/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_name: brandName,
          public_shop_url: publicShopUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update configuration");
      }

      toast.success("Shopify configuration updated successfully!");
      fetchConfig();
    } catch (err: any) {
      toast.error(err.message || "Could not update config.");
    } finally {
      setUpdatingConfig(false);
    }
  };

  // Fetch workflows catalog
  const fetchWorkflows = useCallback(async (silent = false) => {
    if (!silent) setWorkflowsLoading(true);
    try {
      const res = await fetch("/api/integrations/shopify/workflows");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch workflow catalog.");
    } finally {
      if (!silent) setWorkflowsLoading(false);
    }
  }, []);

  // Fetch workflow logs
  const fetchLogs = useCallback(async (pageNum = 1) => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/integrations/shopify/logs?page=${pageNum}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotalPages(data.pages || 1);
        setPage(data.page || 1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchWorkflows();
    fetchLogs(1);
  }, [fetchConfig, fetchWorkflows, fetchLogs]);

  // Open customization drawer
  const handleOpenCustomization = (template: WorkflowTemplate) => {
    setSelectedTemplate(template);
    setEditedMessage(template.message_template || template.default_message_template);
    setDrawerOpen(true);
  };

  // Toggle active/pause status
  const handleToggleStatus = async (template: WorkflowTemplate, action: "activate" | "pause") => {
    try {
      const res = await fetch(`/api/integrations/shopify/workflows/${template.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_template: template.message_template,
          config: template.config,
        }),
      });

      if (res.ok) {
        toast.success(
          action === "activate"
            ? `Activated workflow: ${template.name}`
            : `Paused workflow: ${template.name}`
        );
        fetchWorkflows(true);
      } else {
        const data = await res.json();
        toast.error(data.error || `Failed to ${action} workflow.`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Workflow status update failed.");
    }
  };

  // Save workflow template changes
  const handleSaveWorkflow = async () => {
    if (!selectedTemplate) return;
    setSavingWorkflow(true);

    try {
      const res = await fetch(`/api/integrations/shopify/workflows/${selectedTemplate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_template: editedMessage,
          config: selectedTemplate.config,
        }),
      });

      if (res.ok) {
        toast.success("Workflow changes saved successfully.");
        setDrawerOpen(false);
        fetchWorkflows(true);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save workflow changes.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not save workflow changes.");
    } finally {
      setSavingWorkflow(false);
    }
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleInsertVariable = (variable: string) => {
    setEditedMessage((prev) => prev + ` {{${variable}}}`);
  };

  return (
    <div className="space-y-6 p-6 animate-in fade-in duration-200">
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="cursor-pointer hover:text-foreground" onClick={() => router.push("/integrations")}>
          Integrations
        </span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-semibold text-foreground">Shopify Integration</span>
      </div>

      {/* Header section */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-inner">
            <ShoppingBag className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-foreground">
                Shopify Integration
              </h1>
              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold py-0.5 px-2 rounded-full">
                Active
              </Badge>
              <Badge variant="outline" className="text-[9px] font-semibold text-muted-foreground uppercase border-border">
                Free Plan
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-xl">
              Integrate Shopify with your WhatsApp Business number to automate order updates, status notifications, and recover abandoned carts.
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <a
                href="https://docs.wacrm.com/shopify"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline font-semibold flex items-center gap-1"
              >
                Help Docs <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-9 text-xs border-border flex items-center gap-1 bg-muted/40 hover:bg-muted font-semibold">
            <MoreVertical className="h-4 w-4" /> Options
          </Button>
        </div>
      </header>

      {/* Tabs selectors */}
      <div className="flex items-center border-b border-border pb-px gap-4">
        {[
          { id: "overview", label: "Overview" },
          { id: "config", label: "Configuration" },
          { id: "workflows", label: "Workflows" },
          { id: "logs", label: "Logs" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "text-xs font-bold pb-2.5 transition-all border-b-2 px-1 relative -bottom-[2px] tracking-wide",
              activeTab === tab.id
                ? "border-primary text-foreground scale-102"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Tab Views */}
      <div className="mt-4">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border/80 bg-card p-6 space-y-4 shadow-xs">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Info className="h-4 w-4 text-primary" /> What can I do with Shopify Integration?
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                Unlock high-conversion client communication channels by linking Shopify webhooks to automated WhatsApp notifications templates.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {[
                  {
                    title: "Automated Order Notifications",
                    desc: "Notify customers instantly about order confirmations, delays, and updates.",
                    icon: Package,
                    link: "workflows",
                  },
                  {
                    title: "Fulfillment & Shipping Updates",
                    desc: "Deliver real-time dispatch alerts containing live package tracking links.",
                    icon: Truck,
                    link: "workflows",
                  },
                  {
                    title: "Abandoned Cart Recovery Notifications",
                    desc: "Automate sequence reminders to nudge abandoned checkouts and convert sales.",
                    icon: ShoppingBag,
                    link: "workflows",
                  },
                  {
                    title: "Customer Feedback & Review Requests",
                    desc: "Collect client reviews and feedback via personalized automated post-delivery messages.",
                    icon: MessageSquare,
                    link: "workflows",
                  },
                  {
                    title: "Payment & Refund Confirmations",
                    desc: "Reassure clients immediately when payments clear or returns/refunds process.",
                    icon: CreditCard,
                    link: "workflows",
                  },
                  {
                    title: "Real-time Operations Logs",
                    desc: "Monitor execution runs, delivery ticks, and trigger logs instantly.",
                    icon: ListFilter,
                    link: "logs",
                  },
                ].map((cap, i) => {
                  const Icon = cap.icon;
                  return (
                    <div
                      key={i}
                      onClick={() => setActiveTab(cap.link as any)}
                      className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/40 cursor-pointer transition duration-150 group"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary border border-primary/10 group-hover:scale-105 transition-transform">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-foreground flex items-center gap-1 group-hover:text-primary transition-colors">
                          {cap.title}
                          <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-all ml-1 translate-x-[-4px] group-hover:translate-x-0" />
                        </h3>
                        <p className="text-[11px] text-muted-foreground leading-normal">
                          {cap.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CONFIGURATION TAB */}
        {activeTab === "config" && (
          <div className="max-w-2xl">
            {configLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card className="bg-card border-border/80 p-6">
                <form onSubmit={handleUpdateConfig} className="space-y-5">
                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-foreground">Shopify Store Details</h2>
                    <p className="text-xs text-muted-foreground leading-normal">
                      Configure store identity parameters used when sending dynamic WhatsApp template fields.
                    </p>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="grid gap-2">
                      <Label htmlFor="brandName" className="text-xs font-semibold text-foreground">
                        Brand Name <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        id="brandName"
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        placeholder="e.g. DivyaPrabha Foods"
                        className="bg-muted border-border text-foreground h-9 text-xs"
                        maxLength={40}
                        required
                      />
                      <span className="text-[10px] text-muted-foreground">
                        Maximum 40 characters. Used in standard headers and signatures.
                      </span>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="publicShopUrl" className="text-xs font-semibold text-foreground">
                        Public Shop URL
                      </Label>
                      <Input
                        id="publicShopUrl"
                        type="url"
                        value={publicShopUrl}
                        onChange={(e) => setPublicShopUrl(e.target.value)}
                        placeholder="e.g. https://divyaprabhafoods.com"
                        className="bg-muted border-border text-foreground h-9 text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        Public URL through which customers can access your shop online.
                      </span>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="shopUrl" className="text-xs font-semibold text-foreground">
                        Shop URL (myshopify.com)
                      </Label>
                      <Input
                        id="shopUrl"
                        value={shopUrl}
                        disabled
                        className="bg-muted/60 border-border text-muted-foreground h-9 text-xs select-none"
                      />
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" /> Your shopify domain is derived from your OAuth connection and is read-only.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end border-t border-border/40 pt-4 mt-6">
                    <Button
                      type="submit"
                      disabled={updatingConfig}
                      className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs h-9 shadow-xs"
                    >
                      {updatingConfig && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                      Update Configuration
                    </Button>
                  </div>
                </form>
              </Card>
            )}
          </div>
        )}

        {/* WORKFLOWS TAB */}
        {activeTab === "workflows" && (
          <div className="space-y-4">
            {workflowsLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-xl bg-muted/10 text-center">
                <Workflow className="h-8 w-8 text-muted-foreground animate-bounce" />
                <p className="mt-2 text-xs font-semibold text-foreground">No workflow categories created.</p>
                <p className="text-[11px] text-muted-foreground max-w-sm mt-1">
                  Ensure the database migration `037_shopify_workflows.sql` has been executed on your Supabase dashboard.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {categories.map((cat) => {
                  const CatIcon = CATEGORY_ICONS[cat.key] || Workflow;
                  const isExpanded = !!expandedCategories[cat.key];
                  const configuredCount = cat.templates.filter((t) => t.status === "active").length;

                  return (
                    <div key={cat.id} className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
                      {/* Accordion header */}
                      <button
                        onClick={() => toggleCategory(cat.key)}
                        className="w-full flex items-center justify-between p-4 bg-muted/10 hover:bg-muted/20 border-b border-border/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/5 text-primary border border-primary/10">
                            <CatIcon className="h-4.5 w-4.5" />
                          </div>
                          <div className="text-left">
                            <span className="font-bold text-xs text-foreground block">{cat.name}</span>
                            <span className="text-[10px] text-muted-foreground block font-medium">
                              {cat.templates.length} templates
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {configuredCount > 0 && (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold">
                              {configuredCount} active
                            </Badge>
                          )}
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {/* Accordion templates list */}
                      {isExpanded && (
                        <div className="divide-y divide-border/30">
                          {cat.templates.map((tmpl) => (
                            <div
                              key={tmpl.id}
                              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card hover:bg-muted/5 transition-colors group"
                            >
                              <div className="space-y-1.5 max-w-2xl">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-foreground group-hover:text-primary transition-colors">
                                    {tmpl.name}
                                  </span>
                                  {tmpl.status === "active" ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-none font-bold text-[9px] py-0 px-2 rounded-full">
                                      Active
                                    </Badge>
                                  ) : tmpl.status === "paused" ? (
                                    <Badge className="bg-amber-500/10 text-amber-400 border-none font-bold text-[9px] py-0 px-2 rounded-full">
                                      Paused
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-muted text-muted-foreground border-none font-bold text-[9px] py-0 px-2 rounded-full">
                                      Not Configured
                                    </Badge>
                                  )}
                                  {tmpl.delay_minutes && tmpl.delay_minutes > 0 && (
                                    <span className="text-[10px] text-muted-foreground font-semibold">
                                      ⏱️ {tmpl.delay_minutes >= 1440 ? `${tmpl.delay_minutes / 1440}d` : `${tmpl.delay_minutes / 60}h`} delay
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  {tmpl.description}
                                </p>
                                <div className="flex items-center gap-2.5 text-[10px] font-semibold text-muted-foreground pt-0.5">
                                  <span className="bg-muted/60 border border-border/30 rounded py-0.5 px-1.5 uppercase font-bold text-[8px] text-muted-foreground/80">
                                    Trigger: {tmpl.trigger_event}
                                  </span>
                                  <a href={`https://docs.wacrm.com/workflows/${tmpl.key}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                                    Help Docs <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2.5 shrink-0 self-end md:self-center">
                                {tmpl.status === "active" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleStatus(tmpl, "pause")}
                                    className="h-8 text-xs font-semibold text-amber-300 hover:bg-amber-500/10"
                                  >
                                    <PauseCircle className="h-3.5 w-3.5" /> Pause
                                  </Button>
                                )}
                                {tmpl.status === "paused" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleStatus(tmpl, "activate")}
                                    className="h-8 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10"
                                  >
                                    <PlayCircle className="h-3.5 w-3.5" /> Resume
                                  </Button>
                                )}
                                <Button
                                  variant={tmpl.status === "active" ? "outline" : "default"}
                                  size="sm"
                                  onClick={() => handleOpenCustomization(tmpl)}
                                  className={cn(
                                    "h-8 text-xs font-bold shadow-xs flex items-center gap-1",
                                    tmpl.status === "active"
                                      ? "border-border hover:bg-muted"
                                      : "bg-primary text-primary-foreground hover:bg-primary/95"
                                  )}
                                >
                                  {tmpl.status === "active" ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                  {tmpl.status === "active" ? "Edit" : "Use"}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            {logsLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-xl bg-muted/10 text-center">
                <Workflow className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-xs font-semibold text-foreground">No workflow logs registered yet.</p>
                <p className="text-[11px] text-muted-foreground max-w-sm mt-1">
                  Once active templates trigger notifications, they will be logged here with real-time delivery status updates.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-xl border border-border/80 bg-card">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/15 font-bold text-foreground h-10 select-none">
                        <th className="p-3">Workflow Name</th>
                        <th className="p-3">Recipient Name</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3">Trigger Time</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/5 h-10 transition-colors">
                          <td className="p-3 font-semibold text-foreground">{log.workflow_name}</td>
                          <td className="p-3 flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {log.contact_name}
                          </td>
                          <td className="p-3 text-muted-foreground font-mono">{log.contact_phone}</td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize text-[9px] font-bold py-0.5 px-2 rounded-full",
                                LOG_STATUS_COLORS[log.status]
                              )}
                            >
                              {log.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-border/30 pt-4 text-xs select-none">
                    <span className="text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => fetchLogs(page - 1)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === totalPages}
                        onClick={() => fetchLogs(page + 1)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CUSTOMIZATION DRAWER SLIDE-OVER */}
      {drawerOpen && selectedTemplate && (
        <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-150">
          {/* Backdrop blur clickoff */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={() => setDrawerOpen(false)} />

          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-lg bg-popover text-popover-foreground border-l border-border/80 shadow-2xl flex flex-col justify-between p-6 h-full select-text transform animate-in slide-in-from-right duration-200">
              <div className="space-y-6 flex-1 overflow-y-auto pr-1">
                {/* Drawer header */}
                <div className="flex items-start justify-between border-b border-border/40 pb-4">
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles className="size-4.5 text-primary" /> Customize Workflow template
                    </h2>
                    <span className="text-xs text-muted-foreground font-semibold uppercase bg-muted/60 border border-border/30 py-0.5 px-1.5 rounded">
                      {selectedTemplate.name}
                    </span>
                  </div>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>

                {/* Info block */}
                <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg text-xs leading-relaxed text-muted-foreground flex gap-2">
                  <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    This copy matches the approved template synced in Meta Cloud API (name: <code className="font-bold text-foreground">{selectedTemplate.meta_template_name}</code>). Double-brace tags represent fields loaded dynamically.
                  </div>
                </div>

                {/* Variable placement chips */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Variables Insert Helper</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "customer_name",
                      "order_number",
                      "total_price",
                      "checkout_url",
                      "tracking_url",
                      "product_name",
                      "store_name",
                    ].map((v) => (
                      <button
                        key={v}
                        onClick={() => handleInsertVariable(v)}
                        className="text-[10px] font-bold py-1 px-2.5 rounded bg-muted/70 hover:bg-primary hover:text-primary-foreground border border-border/40 transition-colors"
                      >
                        +{v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textarea editor */}
                <div className="space-y-2">
                  <Label htmlFor="messageTemplate" className="text-xs font-semibold text-foreground">
                    Custom Message Copy
                  </Label>
                  <textarea
                    id="messageTemplate"
                    rows={8}
                    value={editedMessage}
                    onChange={(e) => setEditedMessage(e.target.value)}
                    className="w-full bg-muted border border-border rounded-lg p-3 text-xs leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-y"
                    placeholder="Enter template message copy..."
                  />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Double curly brackets `&#123;&#123;variable&#125;&#125;` resolve dynamically.</span>
                  </div>
                </div>
              </div>

              {/* Drawer footer buttons */}
              <div className="border-t border-border/40 pt-4 flex items-center justify-end gap-2.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDrawerOpen(false)}
                  disabled={savingWorkflow}
                  className="hover:bg-muted text-xs font-semibold"
                >
                  Cancel
                </Button>
                {selectedTemplate.status !== "active" ? (
                  <Button
                    onClick={async () => {
                      setSavingWorkflow(true);
                      await handleToggleStatus(selectedTemplate, "activate");
                      setSavingWorkflow(false);
                      setDrawerOpen(false);
                    }}
                    disabled={savingWorkflow}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 shadow-xs"
                  >
                    Activate Workflow
                  </Button>
                ) : (
                  <Button
                    onClick={handleSaveWorkflow}
                    disabled={savingWorkflow}
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/95 font-bold text-xs h-9 shadow-xs"
                  >
                    {savingWorkflow && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Save Changes
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom UI Card fallback component
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border bg-card text-card-foreground shadow-xs", className)}>
      {children}
    </div>
  );
}
