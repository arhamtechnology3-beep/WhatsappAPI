"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Send,
  ShoppingBag,
  UserCheck,
} from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'

import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'

type RangeDays = 7 | 30 | 90

const DEFAULT_METRICS: MetricsBundle = {
  activeConversations: { current: 0, previous: 0 },
  newContactsToday: { current: 0, previous: 0 },
  openDealsValue: 0,
  openDealsCount: 0,
  messagesSentToday: { current: 0, previous: 0 },
  cartsRecoveredThisWeek: 0,
  cartRecoveryRate: 0,
}

export default function DashboardPage() {
  const { defaultCurrency } = useAuth()
  const [metrics, setMetrics] = useState<MetricsBundle>(DEFAULT_METRICS)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [optInStats, setOptInStats] = useState<{ total: number; optedIn: number; optedOut: number; pct: number } | null>(null)
  const [optInLoading, setOptInLoading] = useState(true)

  const [range, setRange] = useState<RangeDays>(30)
  const [series, setSeries] = useState<Record<RangeDays, ConversationsSeriesPoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()

    void loadMetrics(db)
      .then((m) => setMetrics(m || DEFAULT_METRICS))
      .catch((err) => {
        console.error('[dashboard] metrics failed:', err)
        setMetrics(DEFAULT_METRICS)
      })
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s || [] })))
      .catch((err) => {
        console.error('[dashboard] series failed:', err)
        setSeries((prev) => ({ ...prev, 30: [] }))
      })
      .finally(() => setSeriesLoading(false))

    void loadPipelineDonut(db)
      .then((p) => setPipeline(p))
      .catch((err) => console.error('[dashboard] pipeline failed:', err))
      .finally(() => setPipelineLoading(false))

    void loadResponseTime(db)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))

    void loadActivity(db, 50)
      .then((a) => setActivity(a || []))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))

    const fetchOptInStats = async () => {
      try {
        const { data } = await db
          .from('contacts')
          .select('marketing_opt_in, marketing_opt_out_at');
        if (data) {
          const total = data.length;
          const optedIn = data.filter((c: any) => c.marketing_opt_in === true && !c.marketing_opt_out_at).length;
          const optedOut = data.filter((c: any) => c.marketing_opt_out_at).length;
          const pct = total > 0 ? Math.round((optedIn / total) * 100) : 0;
          setOptInStats({ total, optedIn, optedOut, pct });
        } else {
          setOptInStats({ total: 0, optedIn: 0, optedOut: 0, pct: 0 });
        }
      } catch (err) {
        console.error('[dashboard] opt-in metrics failed:', err);
        setOptInStats({ total: 0, optedIn: 0, optedOut: 0, pct: 0 });
      } finally {
        setOptInLoading(false);
      }
    };
    void fetchOptInStats();
  }, [])

  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setMetricsLoading(false)
      setOptInLoading(false)
      setSeriesLoading(false)
      setPipelineLoading(false)
      setResponseTimeLoading(false)
      setActivityLoading(false)
      setMetrics((prev) => prev || DEFAULT_METRICS)
    }, 3000)

    loadAll()

    return () => clearTimeout(safetyTimer)
  }, [loadAll])

  // Range switch handler — kept in an event callback (not an effect)
  // so the setState calls stay out of the react-hooks/set-state-in-effect
  // rule's way. The cached bucket check means switching back to a
  // previously-viewed range is instant and doesn't re-fetch.
  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r)
      if (series[r] !== null) return
      setSeriesLoading(true)
      const db = createClient()
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false))
    },
    [series],
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live analytics across conversations, contacts, deals, broadcasts, and automations.
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metricsLoading || optInLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title="Active Conversations"
              value={metrics.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
              delta={{
                sign: metrics.activeConversations.previous,
                label: deltaLabel(metrics.activeConversations.previous, 'new today vs yesterday'),
              }}
            />
            <MetricCard
              title="New Contacts Today"
              value={metrics.newContactsToday.current.toLocaleString()}
              icon={UserPlus}
              delta={{
                sign:
                  metrics.newContactsToday.current - metrics.newContactsToday.previous,
                label: deltaLabel(
                  metrics.newContactsToday.current - metrics.newContactsToday.previous,
                  'vs yesterday',
                ),
              }}
            />
            <MetricCard
              title="Open Deals Value"
              value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
              icon={DollarSign}
              subtitle={`${metrics.openDealsCount} open deal${metrics.openDealsCount === 1 ? '' : 's'}`}
            />
            <MetricCard
              title="Messages Sent Today"
              value={metrics.messagesSentToday.current.toLocaleString()}
              icon={Send}
              delta={{
                sign:
                  metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
                label: deltaLabel(
                  metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
                  'vs yesterday',
                ),
              }}
            />
            <MetricCard
              title="Carts Recovered"
              value={metrics.cartsRecoveredThisWeek.toLocaleString()}
              icon={ShoppingBag}
              subtitle={`${metrics.cartRecoveryRate}% recovery rate this week`}
            />
            <MetricCard
              title="Marketing Opt-in Rate"
              value={optInStats ? `${optInStats.pct}%` : '0%'}
              icon={UserCheck}
              subtitle={optInStats ? `${optInStats.optedIn} Opted In / ${optInStats.optedOut} Opted Out` : '0 Opted In / 0 Opted Out'}
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <QuickActions />

      {/* Charts row */}
      {/* items-stretch (the grid default) stretches the two columns to
          match the tallest sibling; adding h-full on each wrapper and
          on the inner panels makes both cards actually fill that
          stretched height so their rounded borders line up. Without
          this, the pipeline card rendered at its natural (shorter)
          height while the line chart drove the row height. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-full lg:col-span-3">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="h-full lg:col-span-2">
          <PipelineDonut
            data={pipeline}
            loading={pipelineLoading}
            currency={defaultCurrency}
          />
        </div>
      </div>

      {/* Response time */}
      <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />

      {/* Activity feed */}
      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}

// ------------------------------------------------------------

function deltaLabel(delta: number, suffix: string): string {
  if (delta === 0) return `No change ${suffix}`
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString()} ${suffix}`
}
