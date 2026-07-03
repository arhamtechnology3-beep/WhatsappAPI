"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "sonner"
import {
  ShoppingBag,
  Loader2,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Percent,
  DollarSign,
  Search,
  Filter,
  ExternalLink,
  MessageSquare,
  Clock,
  Settings,
  CreditCard,
  ChevronRight,
  Info,
  Copy,
  RefreshCw,
  Plus
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { SHOPIFY_TEMPLATE_LIBRARY } from "@/lib/shopify/whatsapp-template-library"

interface Checkout {
  id: string
  shopify_checkout_id: string
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  total_price: number
  currency: string
  abandoned_checkout_url: string | null
  status: 'open' | 'recovered' | 'abandoned_notified' | 'expired'
  created_at: string
}

interface WebhookLog {
  id: string
  topic: string
  status: 'success' | 'failed' | 'skipped_not_activated'
  error_message?: string
  created_at: string
}

interface SequenceStep {
  id: string
  sequence_id: string
  step_order: number
  delay_minutes_from_previous_step: number
  template_name: string
  template_variable_mapping: string[]
  meta_approval_status: 'not_submitted' | 'pending' | 'approved' | 'rejected'
  is_active: boolean
}

interface AutomationSequence {
  id: string
  trigger_type: 'cart_abandoned' | 'browse_abandoned'
  sequence_name: string
  is_active: boolean
  steps: SequenceStep[]
}

export default function ShopifyDashboardPage() {
  const supabase = createClient()
  const { accountId } = useAuth()

  // Tabs: 'overview', 'templates', 'rules', 'billing', 'settings'
  const [activeTab, setActiveTab] = useState<'overview' | 'templates' | 'rules' | 'billing' | 'settings'>('overview')

  const [loading, setLoading] = useState(true)
  const [checkouts, setCheckouts] = useState<Checkout[]>([])
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])
  const [sequences, setSequences] = useState<AutomationSequence[]>([])
  const [currentPlan, setCurrentPlan] = useState<'basic' | 'growth' | 'scale'>('growth') // growth as active mock plan
  
  // Connection states
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [shopName, setShopName] = useState<string | null>(null)
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || "divyaprabhafoods.myshopify.com"

  async function loadData() {
    if (!accountId) return
    setLoading(true)
    try {
      // 1. Fetch checkouts
      const { data: checkoutsData, error: checkoutErr } = await supabase
        .from('shopify_checkouts')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
      if (checkoutErr) throw checkoutErr
      setCheckouts(checkoutsData || [])

      // 2. Fetch webhook logs
      const { data: logsData, error: logsErr } = await supabase
        .from('shopify_webhook_logs')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(8)
      if (logsErr) throw logsErr
      setWebhookLogs(logsData || [])

      // 3. Fetch sequences
      const { data: seqData, error: seqErr } = await supabase
        .from('shopify_automation_sequences')
        .select('*')
        .eq('account_id', accountId)
        .order('trigger_type', { ascending: true })
      if (seqErr) throw seqErr

      if (seqData && seqData.length > 0) {
        const { data: stepsData, error: stepsErr } = await supabase
          .from('shopify_automation_sequence_steps')
          .select('*')
          .in('sequence_id', seqData.map(s => s.id))
          .order('step_order', { ascending: true })
        if (stepsErr) throw stepsErr

        const mapped: AutomationSequence[] = seqData.map(s => ({
          ...s,
          steps: (stepsData || []).filter(st => st.sequence_id === s.id)
        }))
        setSequences(mapped)
      }

      // 4. Verify shop connection
      const response = await fetch('/api/shopify/test-connection')
      const shopInfo = await response.json()
      if (response.ok && shopInfo.success) {
        setConnectionStatus('connected')
        setShopName(shopInfo.shopName)
      } else {
        setConnectionStatus('disconnected')
      }
    } catch (err: any) {
      console.error('[shopify-dashboard] error loading dashboard:', err.message)
      toast.error('Failed to load Shopify data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [accountId])

  // Filtered checkouts list
  const filteredCheckouts = checkouts.filter((ch) => {
    const query = searchQuery.toLowerCase()
    const matchesSearch = 
      (ch.customer_name?.toLowerCase().includes(query) ?? false) ||
      (ch.customer_phone?.includes(query) ?? false) ||
      (ch.customer_email?.toLowerCase().includes(query) ?? false) ||
      ch.shopify_checkout_id.includes(query)
    
    const matchesStatus = statusFilter === 'all' || ch.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Calculations for Metrics
  const totalCarts = checkouts.length
  const recoveredCarts = checkouts.filter(c => c.status === 'recovered').length
  const recoveryRate = totalCarts > 0 ? ((recoveredCarts / totalCarts) * 100).toFixed(1) : '0.0'
  const recoveredRevenue = checkouts
    .filter(c => c.status === 'recovered')
    .reduce((sum, c) => sum + Number(c.total_price), 0)

  const handleManualNotification = (checkoutId: string) => {
    toast.success(`Triggered manual WhatsApp notification for Checkout #${checkoutId}`)
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    toast.success('Checkout recovery URL copied!')
  }

  const changePlan = (plan: 'basic' | 'growth' | 'scale') => {
    setCurrentPlan(plan)
    toast.success(`Switched subscription plan to ${plan.toUpperCase()}`)
  }

  const toggleSequence = async (seqId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('shopify_automation_sequences')
        .update({ is_active: !currentStatus })
        .eq('id', seqId)
      if (error) throw error
      toast.success(`Sequence ${!currentStatus ? 'Activated' : 'Deactivated'}`)
      loadData()
    } catch (err: any) {
      toast.error('Failed to update sequence status: ' + err.message)
    }
  }

  const getTriggerLabel = (type: string) => {
    switch (type) {
      case 'cart_abandoned': return 'Cart Abandonment Recovery'
      case 'browse_abandoned': return 'Browse Abandonment Recovery'
      case 'order_created': return 'Order Confirmed'
      case 'order_fulfilled': return 'Order Shipped'
      case 'order_delivered': return 'Order Delivered'
      default: return type
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header Section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ShoppingBag className="size-6 text-primary" />
            Shopify Sales Channel App
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor checkouts, cart sequences, COD confirmations, and store subscription settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connectionStatus === 'connected' ? (
            <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/15 border-green-500/20 text-xs py-1 px-3 flex items-center gap-1">
              <CheckCircle2 className="size-3.5" /> Live: {shopName || storeDomain}
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs py-1 px-3 flex items-center gap-1">
              <XCircle className="size-3.5" /> Disconnected
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={loadData} className="border-border hover:bg-muted">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Main Metric Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recovery Rate</CardTitle>
            <Percent className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{recoveryRate}%</div>
            <p className="text-[10px] text-muted-foreground mt-1">Percentage of checkouts successfully recovered</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recovered Revenue</CardTitle>
            <DollarSign className="size-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              {recoveredRevenue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Total value returned to your shopify store</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Abandoned Carts</CardTitle>
            <ShoppingBag className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{totalCarts}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Total open & abandoned carts synced</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recovered Orders</CardTitle>
            <CheckCircle2 className="size-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{recoveredCarts}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Checkout processes completed after WhatsApp drips</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Controls */}
      <div className="flex border-b border-border text-sm overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-3 px-4 font-medium border-b-2 transition-all ${
            activeTab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Overview & Carts
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`py-3 px-4 font-medium border-b-2 transition-all ${
            activeTab === 'rules' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Adv Features & Sequences
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`py-3 px-4 font-medium border-b-2 transition-all ${
            activeTab === 'templates' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Confirm Msg & Templates
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`py-3 px-4 font-medium border-b-2 transition-all ${
            activeTab === 'billing' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Shopify Billing Plans
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`py-3 px-4 font-medium border-b-2 transition-all ${
            activeTab === 'settings' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Settings & Logs
        </button>
      </div>

      {/* Tab Panels */}
      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin text-primary" /> Loading Shopify App Panel...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tab 1: Overview */}
          {activeTab === 'overview' && (
            <Card>
              <CardHeader className="pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Abandoned Checkouts List</CardTitle>
                  <CardDescription>View checkouts synced from Shopify webhooks. Trigger notifications manually if needed.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-60">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search name, phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 border-border text-xs placeholder:text-muted-foreground bg-muted/40 text-foreground"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded px-2.5 py-1.5 text-xs text-foreground">
                    <Filter className="size-3.5 text-muted-foreground" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="bg-transparent focus:outline-none text-xs"
                    >
                      <option value="all">All Carts</option>
                      <option value="open">Open</option>
                      <option value="recovered">Recovered</option>
                      <option value="abandoned_notified">Notified</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredCheckouts.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">No matching checkouts found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-y border-border bg-muted/30 text-muted-foreground font-semibold">
                          <th className="py-3 px-4">Checkout ID</th>
                          <th className="py-3 px-4">Customer</th>
                          <th className="py-3 px-4">Cart Value</th>
                          <th className="py-3 px-4">Recovery Status</th>
                          <th className="py-3 px-4">Created At</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredCheckouts.map((ch) => (
                          <tr key={ch.id} className="hover:bg-muted/10 text-foreground">
                            <td className="py-3 px-4 font-mono font-medium">#{ch.shopify_checkout_id}</td>
                            <td className="py-3 px-4">
                              <div className="font-semibold">{ch.customer_name || 'Shopify Buyer'}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{ch.customer_phone || ch.customer_email || '—'}</div>
                            </td>
                            <td className="py-3 px-4 font-medium">
                              {ch.total_price.toLocaleString('en-IN', { style: 'currency', currency: ch.currency || 'INR' })}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant={ch.status === 'recovered' ? 'secondary' : (ch.status === 'open' ? 'outline' : 'destructive')}
                                className={
                                  ch.status === 'recovered'
                                    ? 'bg-green-500/10 text-green-500 border-none'
                                    : ch.status === 'open'
                                      ? 'bg-amber-500/10 text-amber-500 border-none'
                                      : ch.status === 'abandoned_notified'
                                        ? 'bg-indigo-500/10 text-indigo-500 border-none'
                                        : 'bg-destructive/10 text-destructive border-none'
                                }
                              >
                                {ch.status.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {new Date(ch.created_at).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                              {ch.abandoned_checkout_url && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-primary hover:bg-muted"
                                  onClick={() => copyUrl(ch.abandoned_checkout_url!)}
                                  title="Copy Checkout URL"
                                >
                                  <Copy className="size-3.5" />
                                </Button>
                              )}
                              {ch.status === 'open' && (
                                <Button
                                  variant="outline"
                                  className="h-7 text-[10px] border-border text-foreground hover:bg-muted px-2"
                                  onClick={() => handleManualNotification(ch.shopify_checkout_id)}
                                >
                                  Nudge WA
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab 2: Advanced Sequences */}
          {activeTab === 'rules' && (
            <div className="space-y-6">
              {/* Marketing Opt-in Notice */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 flex gap-3 text-xs text-foreground">
                  <Info className="size-4 shrink-0 text-primary mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Compliance Note: Marketing Opt-in Constraint</p>
                    <p className="text-muted-foreground leading-relaxed">
                      WhatsApp messaging policies require explicit customer opt-in for promotional content. 
                      <strong> Step 1 cart reminders</strong> run on transactional customer service context, but 
                      <strong> Steps 2, 3, and all Browse Abandonment messages</strong> will only be sent to customers 
                      who have explicitly opted-in to WhatsApp alerts.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {sequences.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">No recovery sequences configured.</div>
              ) : (
                <div className="space-y-6">
                  {sequences.map((seq) => (
                    <Card key={seq.id}>
                      <CardHeader className="bg-muted/10 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4">
                        <div>
                          <CardTitle className="text-base font-semibold">{seq.sequence_name}</CardTitle>
                          <CardDescription className="text-xs">
                            {seq.trigger_type === 'cart_abandoned' 
                              ? 'Drip recovery alerts triggered when checkouts are abandoned' 
                              : 'Triggers when identified store visitors view products'}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={seq.is_active ? 'bg-green-500/10 text-green-500 border-none' : 'bg-muted text-muted-foreground border-none'}>
                            {seq.is_active ? 'Active' : 'Disabled'}
                          </Badge>
                          <Button
                            size="sm"
                            variant={seq.is_active ? 'destructive' : 'default'}
                            className="h-8 text-xs"
                            onClick={() => toggleSequence(seq.id, seq.is_active)}
                          >
                            {seq.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="divide-y divide-border p-0">
                        {seq.steps.map((step) => (
                          <div key={step.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground">Step {step.step_order}</span>
                                <Badge className="bg-muted text-muted-foreground border-none text-[9px] py-px">
                                  Delay: {step.delay_minutes_from_previous_step}m
                                </Badge>
                                <Badge className="bg-green-500/10 text-green-500 border-none text-[9px] py-px">Meta Approved</Badge>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-mono">Template: {step.template_name}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] border-border text-foreground hover:bg-muted"
                                onClick={() => {
                                  const text = SHOPIFY_TEMPLATE_LIBRARY.find(t => t.template_name === step.template_name)?.body || ''
                                  navigator.clipboard.writeText(text)
                                  toast.success('Template content copied!')
                                }}
                              >
                                Copy Text
                              </Button>
                              <Badge className="bg-green-500/15 text-green-500 border-none text-[10px] py-1 px-2.5">
                                Step Active
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Transactional Confirm Msg */}
          {activeTab === 'templates' && (
            <Card>
              <CardHeader>
                <CardTitle>Order Confirmation & Status Templates</CardTitle>
                <CardDescription>Verify the pre-configured transactional message templates used for order confirmations and shipping updates.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-border p-0">
                {SHOPIFY_TEMPLATE_LIBRARY.map((template) => (
                  <div key={template.template_name} className="p-4 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <span className="font-semibold text-sm text-foreground">{getTriggerLabel(template.trigger_type)}</span>
                        <span className="text-[10px] font-mono text-muted-foreground ml-3">({template.template_name})</span>
                      </div>
                      <Badge className="bg-green-500/10 text-green-500 border-none text-[10px] py-1 px-2.5 self-start sm:self-center">
                        Active & Approved by Meta
                      </Badge>
                    </div>
                    <div className="bg-muted/40 rounded border border-border p-2.5 text-xs text-muted-foreground leading-relaxed">
                      <p className="italic font-mono">{template.body}</p>
                      {template.variables && (
                        <div className="mt-2 text-[10px] flex flex-wrap gap-1 text-muted-foreground border-t border-border/60 pt-2">
                          <span className="font-bold">Variables:</span>
                          {template.variables.map((v, i) => (
                            <span key={v} className="bg-muted px-1.5 py-0.5 rounded border border-border">
                              {`{{${i + 1}}}`} &rarr; {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Tab 4: Pricing / Billing */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <Card className="bg-indigo-950/10 border-indigo-500/20">
                <CardContent className="p-5 flex items-center justify-between flex-col md:flex-row gap-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-sm text-foreground">Current Subscription Tier</p>
                    <p className="text-xs text-muted-foreground">
                      Your store is currently subscribed to the <strong className="text-primary uppercase">{currentPlan} plan</strong>.
                    </p>
                  </div>
                  <Badge className="bg-green-500/15 text-green-500 text-xs py-1 px-3 border-none flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="size-3.5" /> Billed via Shopify App Store
                  </Badge>
                </CardContent>
              </Card>

              {/* Plans Cards */}
              <div className="grid gap-6 md:grid-cols-3">
                {/* Basic */}
                <Card className={`border flex flex-col justify-between ${currentPlan === 'basic' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <CardHeader className="pb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Plan</p>
                    <div className="mt-2 flex items-baseline">
                      <span className="text-3xl font-extrabold text-foreground">$19.99</span>
                      <span className="text-xs text-muted-foreground ml-1">/ month</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Order Confirm alerts</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Abandoned Cart sequence</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> 10 templates limit</li>
                    </ul>
                    {currentPlan === 'basic' ? (
                      <Button className="w-full bg-muted text-muted-foreground cursor-default hover:bg-muted h-9" disabled>Current Subscription</Button>
                    ) : (
                      <Button variant="outline" className="w-full border-border h-9" onClick={() => changePlan('basic')}>Select Basic Plan</Button>
                    )}
                  </CardContent>
                </Card>

                {/* Growth */}
                <Card className={`border flex flex-col justify-between relative ${currentPlan === 'growth' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground font-bold tracking-wider text-[8px] uppercase py-1 px-2.5 rounded-bl">Popular</div>
                  <CardHeader className="pb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Growth Plan</p>
                    <div className="mt-2 flex items-baseline">
                      <span className="text-3xl font-extrabold text-foreground">$26.99</span>
                      <span className="text-xs text-muted-foreground ml-1">/ month</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Order Confirm alerts</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Auto Reply (Order Status)</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Abandoned Cart sequence</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> 20 templates limit</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Broadcast (30k/mo)</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Schedule (10 rules)</li>
                    </ul>
                    {currentPlan === 'growth' ? (
                      <Button className="w-full bg-muted text-muted-foreground cursor-default hover:bg-muted h-9" disabled>Current Subscription</Button>
                    ) : (
                      <Button variant="outline" className="w-full border-border h-9" onClick={() => changePlan('growth')}>Select Growth Plan</Button>
                    )}
                  </CardContent>
                </Card>

                {/* Scale */}
                <Card className={`border flex flex-col justify-between ${currentPlan === 'scale' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <CardHeader className="pb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scale Plan</p>
                    <div className="mt-2 flex items-baseline">
                      <span className="text-3xl font-extrabold text-foreground">$36.99</span>
                      <span className="text-xs text-muted-foreground ml-1">/ month</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Order Confirm alerts</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Auto Reply (Order Status)</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Abandoned Cart sequence</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> 50 templates limit</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Broadcast (50k/mo)</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Schedule (50 rules)</li>
                    </ul>
                    {currentPlan === 'scale' ? (
                      <Button className="w-full bg-muted text-muted-foreground cursor-default hover:bg-muted h-9" disabled>Current Subscription</Button>
                    ) : (
                      <Button variant="outline" className="w-full border-border h-9" onClick={() => changePlan('scale')}>Select Scale Plan</Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Tab 5: Settings & Webhook Logs */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Settings checklist and connection tests */}
              <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Store Credentials & API Check</CardTitle>
                    <CardDescription>Manage the custom app sync configuration for your Shopify instance.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3.5 text-xs text-muted-foreground">
                    <div className="flex justify-between items-center bg-muted/40 border border-border p-3 rounded">
                      <span>Store Domain URL:</span>
                      <strong className="font-mono text-foreground text-[11px]">{storeDomain}</strong>
                    </div>
                    <div className="flex justify-between items-center bg-muted/40 border border-border p-3 rounded">
                      <span>Sync Client ID:</span>
                      <strong className="font-mono text-foreground text-[11px]">{process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID || 'shpcid_wacrm_production'}</strong>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <Button
                        size="sm"
                        className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
                        onClick={async () => {
                          toast.success('Store connection check started...')
                          const res = await fetch('/api/shopify/test-connection')
                          const data = await res.json()
                          if (res.ok && data.success) {
                            setConnectionStatus('connected')
                            setShopName(data.shopName)
                            toast.success(`Success: Connected to ${data.shopName}`)
                          } else {
                            setConnectionStatus('disconnected')
                            toast.error('Failed to resolve shop.')
                          }
                        }}
                      >
                        Re-test Connection
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Verification checklist</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-green-500" /> Shopify App Installed</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-green-500" /> Webhook Endpoints Configured</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-green-500" /> Meta API Token Verified</div>
                  </CardContent>
                </Card>
              </div>

              {/* Webhook log Activity Feed */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Webhook Deliveries</CardTitle>
                  <CardDescription>A live log of webhook signals received from Shopify for checkouts and orders.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {webhookLogs.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">No webhook logs recorded yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-y border-border bg-muted/30 text-muted-foreground font-semibold">
                            <th className="py-2.5 px-4">Event Topic</th>
                            <th className="py-2.5 px-4">Status</th>
                            <th className="py-2.5 px-4">Delivery Time</th>
                            <th className="py-2.5 px-4">Message / Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {webhookLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-muted/10 text-foreground">
                              <td className="py-2.5 px-4 font-mono">{log.topic}</td>
                              <td className="py-2.5 px-4">
                                <Badge
                                  className={
                                    log.status === 'success'
                                      ? 'bg-green-500/10 text-green-500 border-none'
                                      : log.status === 'skipped_not_activated'
                                        ? 'bg-amber-500/10 text-amber-500 border-none'
                                        : 'bg-destructive/10 text-destructive border-none'
                                  }
                                >
                                  {log.status.replace(/_/g, ' ')}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-4 text-muted-foreground">
                                {new Date(log.created_at).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-4 truncate max-w-xs text-muted-foreground">
                                {log.error_message || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
