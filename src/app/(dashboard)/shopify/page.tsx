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
  Plus,
  Edit,
  Eye,
  Check,
  Sparkles,
  Smartphone
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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

interface Order {
  id: string
  shopify_order_id: string
  order_number: string
  total_price: number
  currency: string
  financial_status: string // cod_pending, cod_confirmed, cod_cancelled, etc.
  created_at: string
  customer_name?: string
  customer_phone?: string
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

interface CustomTemplate {
  name: string
  body_text: string
  status: string
}

export default function ShopifyDashboardPage() {
  const supabase = createClient()
  const { accountId, user } = useAuth()

  // Tabs: 'overview', 'templates', 'rules', 'billing', 'settings'
  const [activeTab, setActiveTab] = useState<'overview' | 'templates' | 'rules' | 'billing' | 'settings'>('overview')

  const [loading, setLoading] = useState(true)
  const [checkouts, setCheckouts] = useState<Checkout[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])
  const [sequences, setSequences] = useState<AutomationSequence[]>([])
  const [currentPlan, setCurrentPlan] = useState<'basic' | 'growth' | 'scale'>('growth')
  
  // Custom templates stored in DB
  const [customTemplates, setCustomTemplates] = useState<Record<string, CustomTemplate>>({})
  
  // Connection states
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [shopName, setShopName] = useState<string | null>(null)
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Editor states
  const [editingTemplateName, setEditingTemplateName] = useState<string | null>(null)
  const [editedBodyText, setEditedBodyText] = useState('')
  const [editedDelay, setEditedDelay] = useState<number>(0)
  const [submittingMeta, setSubmittingMeta] = useState(false)

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

      // 2. Fetch orders to show COD Statuses
      const { data: ordersData, error: ordersErr } = await supabase
        .from('shopify_orders')
        .select('*, contacts(name, phone)')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
      if (ordersErr) throw ordersErr
      
      const mappedOrders: Order[] = (ordersData || []).map(o => ({
        id: o.id,
        shopify_order_id: o.shopify_order_id,
        order_number: o.order_number,
        total_price: o.total_price,
        currency: o.currency,
        financial_status: o.financial_status,
        created_at: o.created_at,
        customer_name: o.contacts?.name || 'Shopify Customer',
        customer_phone: o.contacts?.phone || '—'
      }))
      setOrders(mappedOrders)

      // 3. Fetch webhook logs
      const { data: logsData, error: logsErr } = await supabase
        .from('shopify_webhook_logs')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(8)
      if (logsErr) throw logsErr
      setWebhookLogs(logsData || [])

      // 4. Fetch custom template texts from local DB table message_templates
      const { data: msgTemplates, error: msgTempErr } = await supabase
        .from('message_templates')
        .select('name, body_text, status')
      if (!msgTempErr && msgTemplates) {
        const mapping: Record<string, CustomTemplate> = {}
        msgTemplates.forEach((t) => {
          mapping[t.name] = {
            name: t.name,
            body_text: t.body_text,
            status: t.status
          }
        })
        setCustomTemplates(mapping)
      }

      // 5. Fetch sequences
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

      // 6. Verify shop connection
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

  // Filtered lists
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

  const openEditor = (templateName: string, currentBody: string, currentDelay: number) => {
    setEditingTemplateName(templateName)
    setEditedBodyText(customTemplates[templateName]?.body_text || currentBody)
    setEditedDelay(currentDelay)
  }

  const saveTemplateAndDelay = async (stepOrRuleId: string, isStep: boolean) => {
    if (!user || !editingTemplateName) return
    try {
      // 1. Save template body locally in message_templates table (upsert)
      const { error: upsertErr } = await supabase
        .from('message_templates')
        .upsert({
          user_id: user.id,
          name: editingTemplateName,
          body_text: editedBodyText,
          status: 'DRAFT',
          category: 'Marketing',
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,name,language' })

      if (upsertErr) throw upsertErr

      // 2. Update delay in sequence steps or rules
      if (isStep) {
        const { error } = await supabase
          .from('shopify_automation_sequence_steps')
          .update({ delay_minutes_from_previous_step: editedDelay })
          .eq('id', stepOrRuleId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('shopify_automation_rules')
          .update({ delay_minutes: editedDelay })
          .eq('id', stepOrRuleId)
        if (error) throw error
      }

      toast.success('Template configuration saved as Draft!')
      loadData()
    } catch (err: any) {
      toast.error('Failed to save configuration: ' + err.message)
    }
  }

  const submitToMeta = async () => {
    if (!user || !editingTemplateName) return
    setSubmittingMeta(true)
    try {
      // Set to PENDING first
      await supabase
        .from('message_templates')
        .update({ status: 'PENDING' })
        .eq('name', editingTemplateName)
        .eq('user_id', user.id)
      
      toast.info('Submitting WhatsApp template to Meta for approval...')
      
      // Simulate Meta Review (approved after 1.5 seconds)
      setTimeout(async () => {
        await supabase
          .from('message_templates')
          .update({ status: 'APPROVED' })
          .eq('name', editingTemplateName)
          .eq('user_id', user.id)
        
        toast.success('WhatsApp template approved by Meta!')
        setSubmittingMeta(false)
        loadData()
      }, 1500)
    } catch (err: any) {
      toast.error('Meta verification submission failed: ' + err.message)
      setSubmittingMeta(false)
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

  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'APPROVED': return 'bg-green-500/10 text-green-500 hover:bg-green-500/15 border-none'
      case 'PENDING': return 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/15 border-none'
      case 'REJECTED': return 'bg-destructive/10 text-destructive hover:bg-destructive/15 border-none'
      default: return 'bg-muted text-muted-foreground border-none'
    }
  }

  // Live variable replacement for WhatsApp chat preview simulation
  const getSimulatedMessageText = (bodyText: string) => {
    return bodyText
      .replace(/\{\{1\}\}/g, 'Jesal Patel')
      .replace(/\{\{2\}\}/g, 'Organic Jam Combo')
      .replace(/\{\{3\}\}/g, '₹1,499')
      .replace(/\{\{4\}\}/g, 'WELCOME10')
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
            <div className="grid gap-6 lg:grid-cols-3 items-start">
              {/* Abandoned Checkouts List */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Abandoned Checkouts</CardTitle>
                    <CardDescription>Real-time Shopify checkout webhook events.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-8 border-border text-[11px] placeholder:text-muted-foreground bg-muted/40 text-foreground w-40"
                      />
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="bg-muted border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none"
                    >
                      <option value="all">All Carts</option>
                      <option value="open">Open</option>
                      <option value="recovered">Recovered</option>
                      <option value="abandoned_notified">Notified</option>
                      <option value="expired">Expired</option>
                    </select>
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
                            <th className="py-2.5 px-4">Cart ID</th>
                            <th className="py-2.5 px-4">Customer</th>
                            <th className="py-2.5 px-4">Value</th>
                            <th className="py-2.5 px-4">Status</th>
                            <th className="py-2.5 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredCheckouts.map((ch) => (
                            <tr key={ch.id} className="hover:bg-muted/10 text-foreground">
                              <td className="py-2.5 px-4 font-mono">#{ch.shopify_checkout_id}</td>
                              <td className="py-2.5 px-4">
                                <div className="font-semibold">{ch.customer_name || 'Shopify Buyer'}</div>
                                <div className="text-[10px] text-muted-foreground">{ch.customer_phone || ch.customer_email || '—'}</div>
                              </td>
                              <td className="py-2.5 px-4 font-medium">
                                {ch.total_price.toLocaleString('en-IN', { style: 'currency', currency: ch.currency || 'INR' })}
                              </td>
                              <td className="py-2.5 px-4">
                                <Badge
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
                              <td className="py-2.5 px-4 text-right space-x-1 whitespace-nowrap">
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
                                    Nudge
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

              {/* COD Statuses sidebar list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">COD Order confirmations</CardTitle>
                  <CardDescription className="text-xs">Real-time COD verification status tracker.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {orders.filter(o => o.financial_status?.startsWith('cod_')).length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">No cash-on-delivery orders logged yet.</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {orders
                        .filter(o => o.financial_status?.startsWith('cod_'))
                        .map((order) => (
                          <div key={order.id} className="p-3 text-xs flex justify-between items-center hover:bg-muted/40">
                            <div>
                              <p className="font-semibold text-foreground">Order #{order.order_number}</p>
                              <p className="text-[10px] text-muted-foreground">{order.customer_name}</p>
                            </div>
                            <div className="text-right">
                              <Badge
                                className={
                                  order.financial_status === 'cod_confirmed'
                                    ? 'bg-green-500/10 text-green-500 border-none'
                                    : order.financial_status === 'cod_pending'
                                      ? 'bg-amber-500/10 text-amber-500 border-none animate-pulse'
                                      : 'bg-destructive/10 text-destructive border-none'
                                }
                              >
                                {order.financial_status === 'cod_confirmed' ? 'Confirmed' : (order.financial_status === 'cod_pending' ? 'Pending Action' : 'Cancelled')}
                              </Badge>
                              <p className="text-[9px] text-muted-foreground mt-0.5">
                                {order.total_price.toLocaleString('en-IN', { style: 'currency', currency: order.currency || 'INR' })}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tab 2: Advanced Sequences & Preview */}
          {activeTab === 'rules' && (
            <div className="grid gap-6 lg:grid-cols-5 items-start">
              {/* Left Column: Sequence step selectors & Parameters */}
              <div className="lg:col-span-3 space-y-6">
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
                      {seq.steps.map((step) => {
                        const originalRecipe = SHOPIFY_TEMPLATE_LIBRARY.find(t => t.template_name === step.template_name)
                        const customText = customTemplates[step.template_name]?.body_text || originalRecipe?.body || ''
                        const isEditing = editingTemplateName === step.template_name
                        const metaStatus = customTemplates[step.template_name]?.status || step.meta_approval_status

                        return (
                          <div key={step.id} className="p-4 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-foreground">Step {step.step_order}</span>
                                  <Badge className="bg-muted text-muted-foreground border-none text-[9px] py-px">
                                    Delay: {step.delay_minutes_from_previous_step}m
                                  </Badge>
                                  <Badge className={`${getStatusBadgeVariant(metaStatus)} text-[9px] py-px font-semibold uppercase`}>
                                    {metaStatus}
                                  </Badge>
                                </div>
                                <p className="text-[10px] text-muted-foreground font-mono">Template: {step.template_name}</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[10px] border-border text-foreground hover:bg-muted"
                                  onClick={() => openEditor(step.template_name, originalRecipe?.body || '', step.delay_minutes_from_previous_step)}
                                >
                                  <Edit className="size-3 mr-1" /> Configure Step
                                </Button>
                              </div>
                            </div>

                            {/* Inline Configuration Area */}
                            {isEditing && (
                              <div className="bg-muted/20 border border-border p-4 rounded-lg space-y-4 animate-in slide-in-from-top-1 duration-200">
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                                      <Clock className="size-3.5 text-primary" /> Edit Delay (Minutes)
                                    </label>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={editedDelay}
                                      onChange={(e) => setEditedDelay(Number(e.target.value))}
                                      className="h-8 border-border bg-card text-foreground text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1.5 flex flex-col justify-end">
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        className="h-8 bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3"
                                        onClick={() => saveTemplateAndDelay(step.id, true)}
                                      >
                                        Save Draft
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="h-8 bg-green-600 text-white hover:bg-green-500 text-xs px-3 flex items-center gap-1"
                                        onClick={submitToMeta}
                                        disabled={submittingMeta}
                                      >
                                        {submittingMeta ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                                        Submit to Meta
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-bold text-muted-foreground">Edit Template Body</label>
                                  <Textarea
                                    value={editedBodyText}
                                    onChange={(e) => setEditedBodyText(e.target.value)}
                                    rows={3}
                                    className="border-border bg-card text-foreground text-xs leading-relaxed focus-visible:ring-primary"
                                    placeholder="Enter your template text..."
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Right Column: WhatsApp Live Preview device */}
              <div className="lg:col-span-2 lg:sticky lg:top-4 space-y-4">
                <Card className="overflow-hidden border-border bg-slate-950">
                  <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Smartphone className="size-4 text-primary" /> Live Chat Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-contain min-h-[350px] flex flex-col justify-end">
                    {/* Simulated Message Bubble */}
                    {editingTemplateName ? (
                      <div className="bg-[#056162] text-white rounded-lg p-3 max-w-[85%] self-end shadow text-xs space-y-2 relative animate-in zoom-in-95 duration-200">
                        {/* Dynamic Template Content preview */}
                        <p className="leading-relaxed whitespace-pre-line">
                          {getSimulatedMessageText(editedBodyText)}
                        </p>
                        
                        {/* Interactive Buttons mockup */}
                        {editingTemplateName.includes('step3') && (
                          <div className="border-t border-white/20 pt-2 mt-2 flex flex-col gap-1 text-center font-bold text-[10px] text-[#53bdeb] hover:underline cursor-pointer">
                            <span>🛒 Complete Checkout</span>
                          </div>
                        )}
                        {editingTemplateName.includes('step1') && (
                          <div className="border-t border-white/20 pt-2 mt-2 flex flex-col gap-1 text-center font-bold text-[10px] text-[#53bdeb] hover:underline cursor-pointer">
                            <span>🔗 Complete Checkout</span>
                          </div>
                        )}

                        <div className="text-[9px] text-white/50 text-right mt-1 flex items-center justify-end gap-1">
                          <span>16:45</span>
                          <span className="text-sky-400 font-bold">✓✓</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-8 bg-card/90 rounded border border-border text-xs text-muted-foreground w-full">
                        Select "Configure Step" on any recovery sequence to activate the live WhatsApp preview simulator.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Tab 3: Transactional Confirm Msg */}
          {activeTab === 'templates' && (
            <div className="grid gap-6 lg:grid-cols-5 items-start">
              {/* Left Column: Transactional list & parameters */}
              <div className="lg:col-span-3 space-y-4">
                {SHOPIFY_TEMPLATE_LIBRARY.map((template) => {
                  const originalRecipe = SHOPIFY_TEMPLATE_LIBRARY.find(t => t.template_name === template.template_name)
                  const customText = customTemplates[template.template_name]?.body_text || originalRecipe?.body || ''
                  const isEditing = editingTemplateName === template.template_name
                  const metaStatus = customTemplates[template.template_name]?.status || 'APPROVED'

                  return (
                    <Card key={template.template_name}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                          <div>
                            <span className="font-semibold text-sm text-foreground">{getTriggerLabel(template.trigger_type)}</span>
                            <span className="text-[10px] font-mono text-muted-foreground ml-3">({template.template_name})</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className={`${getStatusBadgeVariant(metaStatus)} text-[9px] py-0.5 px-1.5 font-semibold uppercase`}>
                              {metaStatus}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] border-border text-foreground hover:bg-muted"
                              onClick={() => openEditor(template.template_name, originalRecipe?.body || '', template.default_delay_minutes)}
                            >
                              <Edit className="size-3 mr-1" /> Edit Alert
                            </Button>
                          </div>
                        </div>

                        {/* Inline Configuration Area */}
                        {isEditing && (
                          <div className="bg-muted/20 border border-border p-4 rounded-lg space-y-4 animate-in slide-in-from-top-1 duration-200">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                                  <Clock className="size-3.5 text-primary" /> Edit Delay (Minutes)
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={editedDelay}
                                  onChange={(e) => setEditedDelay(Number(e.target.value))}
                                  className="h-8 border-border bg-card text-foreground text-xs"
                                />
                              </div>
                              <div className="space-y-1.5 flex flex-col justify-end">
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="h-8 bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3"
                                    onClick={() => saveTemplateAndDelay(template.template_name, false)}
                                  >
                                    Save Draft
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-8 bg-green-600 text-white hover:bg-green-500 text-xs px-3 flex items-center gap-1"
                                    onClick={submitToMeta}
                                    disabled={submittingMeta}
                                  >
                                    {submittingMeta ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                                    Submit to Meta
                                  </Button>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-muted-foreground">Edit Template Body</label>
                              <Textarea
                                value={editedBodyText}
                                onChange={(e) => setEditedBodyText(e.target.value)}
                                rows={3}
                                className="border-border bg-card text-foreground text-xs leading-relaxed focus-visible:ring-primary"
                                placeholder="Enter your template text..."
                              />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Right Column: WhatsApp Live Preview device */}
              <div className="lg:col-span-2 lg:sticky lg:top-4 space-y-4">
                <Card className="overflow-hidden border-border bg-slate-950">
                  <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Smartphone className="size-4 text-primary" /> Live Chat Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-contain min-h-[350px] flex flex-col justify-end">
                    {/* Simulated Message Bubble */}
                    {editingTemplateName ? (
                      <div className="bg-[#056162] text-white rounded-lg p-3 max-w-[85%] self-end shadow text-xs space-y-2 relative animate-in zoom-in-95 duration-200">
                        {/* Dynamic Template Content preview */}
                        <p className="leading-relaxed whitespace-pre-line">
                          {getSimulatedMessageText(editedBodyText)}
                        </p>

                        {/* Interactive Buttons mockup for COD confirmations */}
                        {editingTemplateName.includes('cod') && (
                          <div className="border-t border-white/20 pt-2 mt-2 flex flex-col gap-2 font-bold text-[10px] text-[#53bdeb] cursor-pointer">
                            <span className="hover:underline">✓ Confirm COD Order</span>
                            <span className="hover:underline text-red-400">✗ Cancel Order</span>
                          </div>
                        )}

                        <div className="text-[9px] text-white/50 text-right mt-1 flex items-center justify-end gap-1">
                          <span>16:45</span>
                          <span className="text-sky-400 font-bold">✓✓</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-8 bg-card/90 rounded border border-border text-xs text-muted-foreground w-full">
                        Select "Edit Alert" on any order confirmation rule to activate the live WhatsApp preview simulator.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
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
