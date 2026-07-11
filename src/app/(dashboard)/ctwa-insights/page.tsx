"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Megaphone,
  Globe,
  MoreHorizontal,
  Calendar,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Custom brand-accurate SVG components to prevent lucide-react version compatibility issues
const Instagram = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    style={props.style}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const Facebook = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    style={props.style}
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Preset = "7days" | "month" | "3months" | "custom";

interface SummaryItem {
  source_channel: string;
  total_conversations: number;
  carts_recovered: number;
  revenue_recovered: number;
  previous_conversations: number;
  conversation_change_pct: number;
}

interface TrendPoint {
  date: string;
  instagram: number;
  facebook_post: number;
  facebook_ads: number;
  google: number;
  other: number;
  [key: string]: any;
}

const CHANNEL_META = {
  instagram: {
    label: "Instagram",
    description: "Incoming conversations from Instagram.",
    icon: Instagram,
    bgClass: "bg-pink-500/10 text-pink-500",
    borderClass: "border-pink-500/20",
    stroke: "#d946ef", // pink-500
    fill: "rgba(217, 70, 239, 0.05)",
    dotClass: "bg-pink-500",
  },
  facebook_post: {
    label: "Facebook Post",
    description: "Incoming conversations from facebook post.",
    icon: Facebook,
    bgClass: "bg-blue-600/10 text-blue-600",
    borderClass: "border-blue-600/20",
    stroke: "#2563eb", // blue-600
    fill: "rgba(37, 99, 235, 0.05)",
    dotClass: "bg-blue-600",
  },
  facebook_ads: {
    label: "Facebook Ads",
    description: "Incoming conversations from facebook ads.",
    icon: Megaphone,
    bgClass: "bg-cyan-500/10 text-cyan-500",
    borderClass: "border-cyan-500/20",
    stroke: "#06b6d4", // cyan-500
    fill: "rgba(6, 182, 212, 0.05)",
    dotClass: "bg-cyan-500",
  },
  google: {
    label: "Google",
    description: "Incoming conversations from google.",
    icon: Globe,
    bgClass: "bg-yellow-500/10 text-yellow-500",
    borderClass: "border-yellow-500/20",
    stroke: "#eab308", // yellow-500
    fill: "rgba(234, 179, 8, 0.05)",
    dotClass: "bg-yellow-500",
  },
  other: {
    label: "Others",
    description: "Incoming conversations from others.",
    icon: MoreHorizontal,
    bgClass: "bg-slate-500/10 text-slate-500",
    borderClass: "border-slate-500/20",
    stroke: "#64748b", // slate-500
    fill: "rgba(100, 116, 139, 0.05)",
    dotClass: "bg-slate-500",
  },
} as const;

function getPresetDates(preset: Preset): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (preset === "7days") {
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (preset === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (preset === "3months") {
    start.setMonth(end.getMonth() - 2);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

export default function CTWAInsightsPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "data">("overview");
  const [preset, setPreset] = useState<Preset>("7days");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() =>
    getPresetDates("7days")
  );

  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<SummaryItem[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Recharts Legend visibility toggle state
  const [visibleChannels, setVisibleChannels] = useState<Record<string, boolean>>({
    instagram: true,
    facebook_post: true,
    facebook_ads: true,
    google: true,
    other: true,
  });

  // Format date range string for display
  const dateRangeDisplay = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    };
    const startStr = dateRange.start.toLocaleDateString("en-GB", options);
    const endStr = dateRange.end.toLocaleDateString("en-GB", options);
    return `${startStr} - ${endStr}`;
  }, [dateRange]);

  // Sync date range when preset changes
  const handlePresetSelect = (selectedPreset: Preset) => {
    setPreset(selectedPreset);
    if (selectedPreset !== "custom") {
      const range = getPresetDates(selectedPreset);
      setDateRange(range);
    }
  };

  // Custom date selection submission
  const handleCustomDateSubmit = () => {
    if (customStart && customEnd) {
      const start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      if (start > end) {
        alert("Start date must be before end date");
        return;
      }
      setDateRange({ start, end });
      setPreset("custom");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const startIso = dateRange.start.toISOString();
      const endIso = dateRange.end.toISOString();

      const [summaryRes, trendRes] = await Promise.all([
        fetch(`/api/insights/ctwa/summary?start=${startIso}&end=${endIso}`),
        fetch(`/api/insights/ctwa/trend?start=${startIso}&end=${endIso}`),
      ]);

      if (!summaryRes.ok || !trendRes.ok) {
        throw new Error("Failed to fetch CTWA Insights data. Ensure DB migrations are run.");
      }

      const summaryJson = await summaryRes.json();
      const trendJson = await trendRes.json();

      setSummaryData(summaryJson.summary || []);
      setTrendData(trendJson.trend || []);
    } catch (err: any) {
      console.error("Error fetching CTWA insights:", err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Fetch when range changes
  useEffect(() => {
    fetchData();
  }, [dateRange]);

  // Toggle legendary series visibility
  const toggleChannelVisibility = (channel: string) => {
    setVisibleChannels((prev) => ({
      ...prev,
      [channel]: !prev[channel],
    }));
  };

  // Determine if trend chart has any data points greater than 0
  const hasChartData = useMemo(() => {
    return trendData.some((point) =>
      Object.keys(CHANNEL_META).some((ch) => point[ch] > 0)
    );
  }, [trendData]);

  // Format currency for display (INR style)
  const formatCurrency = (val: number) => {
    return val.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });
  };

  // Custom Recharts Tooltip component
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dateObj = new Date(label);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      return (
        <div className="bg-background/95 border border-border shadow-xl rounded-lg p-3 text-xs space-y-1.5 backdrop-blur-sm">
          <p className="font-semibold text-foreground border-b border-border pb-1 mb-1">{formattedDate}</p>
          {payload.map((p: any) => {
            const chMeta = CHANNEL_META[p.name as keyof typeof CHANNEL_META];
            return (
              <div key={p.name} className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", chMeta?.dotClass)} />
                  <span className="text-muted-foreground">{chMeta?.label || p.name}:</span>
                </div>
                <span className="font-bold text-foreground">{p.value}</span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top Header Control Area */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">CTWA Insights</h1>
          {/* Sub-tabs under title */}
          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={() => setActiveTab("overview")}
              className={cn(
                "pb-1 text-sm font-semibold border-b-2 transition duration-200",
                activeTab === "overview"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("data")}
              className={cn(
                "pb-1 text-sm font-semibold border-b-2 transition duration-200",
                activeTab === "data"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Data
            </button>
          </div>
        </div>

        {/* Date Range Selection & Refresh Button */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="h-9 border-border bg-card text-foreground hover:bg-muted text-xs flex items-center gap-2 px-3 shadow-sm font-medium"
                />
              }
            >
              <Calendar className="size-4 text-muted-foreground" />
              <span>{dateRangeDisplay}</span>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4 border border-border bg-card shadow-2xl rounded-xl space-y-4">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date Presets</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant={preset === "7days" ? "default" : "outline"}
                    onClick={() => handlePresetSelect("7days")}
                    className="text-xs h-8"
                  >
                    Past 7 days
                  </Button>
                  <Button
                    size="sm"
                    variant={preset === "month" ? "default" : "outline"}
                    onClick={() => handlePresetSelect("month")}
                    className="text-xs h-8"
                  >
                    This month
                  </Button>
                  <Button
                    size="sm"
                    variant={preset === "3months" ? "default" : "outline"}
                    onClick={() => handlePresetSelect("3months")}
                    className="text-xs h-8"
                  >
                    3 months
                  </Button>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Range</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Start date</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full bg-background border border-border rounded p-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">End date</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full bg-background border border-border rounded p-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleCustomDateSubmit}
                  className="w-full text-xs h-8 mt-1"
                >
                  Apply Custom Range
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="icon"
            onClick={fetchData}
            disabled={loading}
            className="size-9 border-border bg-card hover:bg-muted text-foreground"
          >
            <RefreshCw className={cn("size-4 text-muted-foreground", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/20 bg-destructive/5 text-destructive p-4 flex items-start gap-3 rounded-xl">
          <AlertCircle className="size-5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h4 className="font-semibold text-sm">Database Setup Required</h4>
            <p className="text-xs text-destructive/80 leading-relaxed">
              Before tracking source channels, you must apply the database migrations to your Supabase instance.
              Please copy the SQL commands from the <code>supabase/migrations/034_conversation_sources.sql</code> file
              and run them in your Supabase Dashboard SQL Editor.
            </p>
          </div>
        </Card>
      )}

      {activeTab === "overview" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* 5 Response Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {loading ? (
              // Card Skeleton Loader
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="bg-card/50 border border-border/80 animate-pulse">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="h-4 w-20 bg-muted rounded" />
                    <div className="size-8 bg-muted rounded-lg" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-8 w-12 bg-muted rounded" />
                    <div className="h-3.5 w-32 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))
            ) : (
              // Live Metric Cards
              Object.entries(CHANNEL_META).map(([key, meta]) => {
                const data = summaryData.find((d) => d.source_channel === key) || {
                  total_conversations: 0,
                  carts_recovered: 0,
                  revenue_recovered: 0,
                  conversation_change_pct: 0,
                };

                const Icon = meta.icon;
                const change = data.conversation_change_pct;
                const isPositive = change > 0;
                const isNegative = change < 0;

                return (
                  <Card key={key} className="bg-card/45 hover:bg-card/75 border border-border/70 hover:border-border/100 transition-all duration-300 shadow-sm flex flex-col justify-between">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                      <div>
                        <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                      </div>
                      <div className={cn("p-1.5 rounded-lg shrink-0", meta.bgClass)}>
                        <Icon className="size-4" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-foreground">{data.total_conversations}</span>
                        {/* Comparison delta badge */}
                        <span
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-tight shadow-sm transition",
                            isPositive && "bg-green-500/10 text-green-500",
                            isNegative && "bg-red-500/10 text-red-500",
                            !isPositive && !isNegative && "bg-muted text-muted-foreground"
                          )}
                        >
                          {isPositive ? `+${change}%` : `${change}%`}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        {data.carts_recovered} carts recovered · <span className="font-semibold text-foreground/90">{formatCurrency(data.revenue_recovered)}</span>
                      </p>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Daily Source Trend chart widget */}
          <Card className="border border-border/80 bg-card/30 overflow-hidden shadow-sm">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-4">
              <div>
                <CardTitle className="text-base font-bold text-foreground">Daily Source Trend</CardTitle>
                <p className="text-xs text-muted-foreground">Monitor WhatsApp conversation source contribution over time.</p>
              </div>

              {/* Presets and custom legend toggles */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Custom Legend (Interactive Toggles) */}
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium border-r border-border/50 pr-4 mr-1">
                  {Object.entries(CHANNEL_META).map(([key, meta]) => {
                    const isVisible = visibleChannels[key];
                    return (
                      <button
                        key={key}
                        onClick={() => toggleChannelVisibility(key)}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-md transition-all hover:bg-muted/80",
                          !isVisible && "opacity-40 line-through"
                        )}
                        title={`Click to toggle ${meta.label} visibility`}
                      >
                        <span className={cn("size-2 rounded-full shrink-0", meta.dotClass)} />
                        <span className="text-foreground">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Range buttons for quick toggle in trend card */}
                <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/40 text-xs">
                  <button
                    onClick={() => handlePresetSelect("7days")}
                    className={cn(
                      "px-2.5 py-1 rounded-md transition font-medium",
                      preset === "7days"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Past 7 days
                  </button>
                  <button
                    onClick={() => handlePresetSelect("month")}
                    className={cn(
                      "px-2.5 py-1 rounded-md transition font-medium",
                      preset === "month"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    This month
                  </button>
                  <button
                    onClick={() => handlePresetSelect("3months")}
                    className={cn(
                      "px-2.5 py-1 rounded-md transition font-medium",
                      preset === "3months"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Last 3 months
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 pl-2 pr-6">
              {loading ? (
                // Chart Shimmer Skeleton
                <div className="w-full h-80 flex flex-col justify-between animate-pulse">
                  <div className="flex justify-between items-baseline h-64 border-b border-border/50 pb-2">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="w-10 bg-muted/50 rounded-t" style={{ height: `${20 + i * 12}%` }} />
                    ))}
                  </div>
                  <div className="flex justify-between px-2 pt-2">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="h-3 w-12 bg-muted rounded" />
                    ))}
                  </div>
                </div>
              ) : !hasChartData ? (
                // Centered Empty State
                <div className="h-80 w-full flex flex-col items-center justify-center text-center space-y-3 p-6">
                  <div className="p-3 bg-muted/50 text-muted-foreground rounded-full border border-border/80">
                    <TrendingUp className="size-6" />
                  </div>
                  <div className="max-w-xs space-y-1">
                    <p className="font-semibold text-sm text-foreground">No conversations yet</p>
                    <p className="text-xs text-muted-foreground leading-normal">
                      Connect a marketing channel or start running Click-to-WhatsApp ads to begin tracking.
                    </p>
                  </div>
                </div>
              ) : (
                // Recharts Chart container (horizontally scrollable on small mobile)
                <div className="w-full overflow-x-auto">
                  <div className="h-80 min-w-[650px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={trendData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          {Object.entries(CHANNEL_META).map(([key, meta]) => (
                            <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={meta.stroke} stopOpacity={0.15} />
                              <stop offset="95%" stopColor={meta.stroke} stopOpacity={0.0} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                        <XAxis
                          dataKey="date"
                          stroke="var(--muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          dy={10}
                          tickFormatter={(dateStr) => {
                            const d = new Date(dateStr);
                            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                          }}
                        />
                        <YAxis
                          stroke="var(--muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip content={<CustomChartTooltip />} />
                        {Object.entries(CHANNEL_META).map(([key, meta]) => (
                          <Area
                            key={key}
                            type="monotone"
                            dataKey={key}
                            name={key}
                            stroke={meta.stroke}
                            strokeWidth={2}
                            fill={`url(#grad-${key})`}
                            hide={!visibleChannels[key]}
                            stackId="1"
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "data" && (
        <Card className="border border-border/80">
          <CardHeader>
            <CardTitle className="text-base font-bold text-foreground">Traffic Sources Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 w-full bg-muted animate-pulse rounded-md" />
                ))}
              </div>
            ) : summaryData.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">No traffic breakdown logged.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-y border-border bg-muted/40 text-muted-foreground font-semibold">
                      <th className="py-3 px-6">Channel</th>
                      <th className="py-3 px-6 text-right">Conversations</th>
                      <th className="py-3 px-6 text-right">Carts Recovered</th>
                      <th className="py-3 px-6 text-right">Revenue Recovered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {summaryData.map((row) => {
                      const meta = CHANNEL_META[row.source_channel as keyof typeof CHANNEL_META];
                      return (
                        <tr key={row.source_channel} className="hover:bg-muted/10 text-foreground transition-colors duration-150">
                          <td className="py-3 px-6 font-medium flex items-center gap-2">
                            <span className={cn("size-2 rounded-full", meta?.dotClass)} />
                            <span>{meta?.label || row.source_channel}</span>
                          </td>
                          <td className="py-3 px-6 text-right font-mono font-semibold">{row.total_conversations}</td>
                          <td className="py-3 px-6 text-right font-mono">{row.carts_recovered}</td>
                          <td className="py-3 px-6 text-right font-mono font-bold text-green-500">
                            {formatCurrency(row.revenue_recovered)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
