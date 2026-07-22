"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  ShoppingBag,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Settings,
  Info,
  Clock,
  Sparkles
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { SettingsPanelHead } from "./settings-panel-head"
import { Badge } from "@/components/ui/badge"
import { SHOPIFY_TEMPLATE_LIBRARY } from "@/lib/shopify/whatsapp-template-library"

interface WebhookLog {
  id: string
  topic: string
  status: 'success' | 'failed' | 'skipped_not_activated'
  error_message?: string
  created_at: string
}

interface AutomationRule {
  id: string
  trigger_type: 'order_created' | 'order_fulfilled' | 'order_delivered'
  template_name: string
  template_variable_mapping: string[]
  delay_minutes: number
  meta_approval_status: 'not_submitted' | 'pending' | 'approved' | 'rejected'
  is_active: boolean
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

export function ShopifySettings() {
  const supabase = createClient()
  const { accountId, profileLoading } = useAuth()

  const [checking, setChecking] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [shopName, setShopName] = useState<string | null>(null)
  const [shopDomain, setShopDomain] = useState<string | null>(null)
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)

  // Rules and Sequences states
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(true)
  const [sequences, setSequences] = useState<AutomationSequence[]>([])
  const [sequencesLoading, setSequencesLoading] = useState(true)
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null)

  const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || "divyaprabhafoods.myshopify.com"

  // 1) Load connection status, webhook logs, rules and sequences
  async function checkConnection(silent = false) {
    if (!silent) setChecking(true)
    try {
      const response = await fetch('/api/shopify/test-connection')
      const data = await response.json()

      if (response.ok && data.success) {
        setConnectionStatus('connected')
        setShopName(data.shopName)
        setShopDomain(data.domain)
        if (!silent) toast.success(`Connected to Shopify store: ${data.shopName}`)
      } else {
        setConnectionStatus('disconnected')
        setShopName(null)
        setShopDomain(null)
        if (!silent) toast.error(data.error || 'Failed to connect to Shopify store.')
      }
    } catch (err: any) {
      setConnectionStatus('disconnected')
      if (!silent) toast.error('Error testing Shopify connection.')
    } finally {
      setChecking(false)
    }
  }

  async function loadWebhookLogs() {
    if (!accountId) {
      setLogsLoading(false)
      return
    }
    setLogsLoading(true)
    try {
      const { data, error } = await supabase
        .from('shopify_webhook_logs')
        .select('id, topic, status, error_message, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      setWebhookLogs(data || [])
    } catch (err: any) {
      console.error('Error loading webhook logs:', err.message)
    } finally {
      setLogsLoading(false)
    }
  }

  async function loadRulesAndSequences() {
    if (!accountId) {
      setRulesLoading(false)
      setSequencesLoading(false)
      return
    }
    setRulesLoading(true)
    setSequencesLoading(true)
    try {
      // Load flat transactional rules
      let { data: rulesData, error: rulesErr } = await supabase
        .from('shopify_automation_rules')
        .select('*')
        .eq('account_id', accountId)
        .neq('trigger_type', 'cart_abandoned')
        .order('trigger_type', { ascending: true })

      if (rulesErr) console.error('Error fetching rules:', rulesErr.message)

      // Auto-seed default rules if empty
      if (!rulesData || rulesData.length === 0) {
        const defaultRules = [
          { account_id: accountId, trigger_type: 'order_created', template_name: 'wacrm_order_confirmed_v1', template_variable_mapping: ['customer_name', 'order_number', 'total_price'], delay_minutes: 0, meta_approval_status: 'approved', is_active: true },
          { account_id: accountId, trigger_type: 'order_fulfilled', template_name: 'wacrm_order_shipped_v1', template_variable_mapping: ['customer_name', 'order_number', 'tracking_url'], delay_minutes: 0, meta_approval_status: 'approved', is_active: true },
          { account_id: accountId, trigger_type: 'order_delivered', template_name: 'wacrm_order_delivered_v1', template_variable_mapping: ['customer_name', 'order_number'], delay_minutes: 0, meta_approval_status: 'approved', is_active: true },
        ]
        const { data: seededRules } = await supabase
          .from('shopify_automation_rules')
          .insert(defaultRules)
          .select()
        rulesData = seededRules || defaultRules as any
      }

      setRules(rulesData || [])

      // Load sequences
      let { data: seqsData, error: seqsErr } = await supabase
        .from('shopify_automation_sequences')
        .select('*')
        .eq('account_id', accountId)
        .order('trigger_type', { ascending: true })

      if (seqsErr) console.error('Error fetching sequences:', seqsErr.message)

      // Auto-seed default sequences if empty
      if (!seqsData || seqsData.length === 0) {
        const { data: cartSeq } = await supabase
          .from('shopify_automation_sequences')
          .insert({ account_id: accountId, trigger_type: 'cart_abandoned', sequence_name: 'Cart Abandonment Recovery', is_active: true })
          .select()
          .single()

        if (cartSeq) {
          await supabase.from('shopify_automation_sequence_steps').insert([
            { sequence_id: cartSeq.id, step_order: 1, delay_minutes_from_previous_step: 30, template_name: 'wacrm_cart_abandoned_v1', template_variable_mapping: ['customer_name', 'product_name', 'store_name', 'checkout_url'], meta_approval_status: 'approved', is_active: true },
            { sequence_id: cartSeq.id, step_order: 2, delay_minutes_from_previous_step: 1440, template_name: 'wacrm_cart_reminder_step2_v1', template_variable_mapping: ['customer_name', 'product_name', 'total_price'], meta_approval_status: 'approved', is_active: true },
            { sequence_id: cartSeq.id, step_order: 3, delay_minutes_from_previous_step: 1440, template_name: 'wacrm_cart_reminder_step3_v1', template_variable_mapping: ['customer_name', 'product_name', 'checkout_url', 'discount_code'], meta_approval_status: 'approved', is_active: true },
          ])
        }

        const { data: browseSeq } = await supabase
          .from('shopify_automation_sequences')
          .insert({ account_id: accountId, trigger_type: 'browse_abandoned', sequence_name: 'Browse Abandonment Recovery', is_active: true })
          .select()
          .single()

        if (browseSeq) {
          await supabase.from('shopify_automation_sequence_steps').insert([
            { sequence_id: browseSeq.id, step_order: 1, delay_minutes_from_previous_step: 30, template_name: 'wacrm_browse_abandoned_v1', template_variable_mapping: ['customer_name', 'product_name', 'total_price', 'product_url'], meta_approval_status: 'approved', is_active: true }
          ])
        }

        const { data: refetchedSeqs } = await supabase
          .from('shopify_automation_sequences')
          .select('*')
          .eq('account_id', accountId)
          .order('trigger_type', { ascending: true })
        seqsData = refetchedSeqs || []
      }

      const seqIds = (seqsData || []).map((s) => s.id)
      if (seqIds.length > 0) {
        const { data: stepsData, error: stepsErr } = await supabase
          .from('shopify_automation_sequence_steps')
          .select('*')
          .in('sequence_id', seqIds)
          .order('step_order', { ascending: true })

        if (stepsErr) console.error('Error fetching sequence steps:', stepsErr.message)

        const grouped: AutomationSequence[] = (seqsData || []).map((s) => ({
          ...s,
          steps: (stepsData || []).filter((st) => st.sequence_id === s.id),
        }))
        setSequences(grouped)
      } else {
        setSequences([])
      }
    } catch (err: any) {
      console.error('Error loading automations:', err.message)
    } finally {
      setRulesLoading(false)
      setSequencesLoading(false)
    }
  }

  async function updateRule(ruleId: string, updates: Partial<AutomationRule>) {
    try {
      const { error } = await supabase
        .from('shopify_automation_rules')
        .update(updates)
        .eq('id', ruleId)

      if (error) throw error
      toast.success('Automation rule updated')
      loadRulesAndSequences()
    } catch (err: any) {
      toast.error('Failed to update rule: ' + err.message)
    }
  }

  async function updateSequence(seqId: string, updates: Partial<AutomationSequence>) {
    try {
      const { error } = await supabase
        .from('shopify_automation_sequences')
        .update(updates)
        .eq('id', seqId)

      if (error) throw error
      toast.success('Sequence status updated')
      loadRulesAndSequences()
    } catch (err: any) {
      toast.error('Failed to update sequence: ' + err.message)
    }
  }

  async function updateStep(stepId: string, updates: Partial<SequenceStep>) {
    try {
      const { error } = await supabase
        .from('shopify_automation_sequence_steps')
        .update(updates)
        .eq('id', stepId)

      if (error) throw error
      toast.success('Sequence step updated')
      loadRulesAndSequences()
    } catch (err: any) {
      toast.error('Failed to update step: ' + err.message)
    }
  }

  const copyTemplateText = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Template text copied to clipboard!')
  }

  useEffect(() => {
    checkConnection(true)

    if (profileLoading) return

    if (!accountId) {
      setLogsLoading(false)
      setRulesLoading(false)
      setSequencesLoading(false)
      return
    }

    loadWebhookLogs()
    loadRulesAndSequences()

    const logsChannel = supabase
      .channel('shopify-webhook-logs-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'shopify_webhook_logs',
          filter: `account_id=eq.${accountId}`,
        },
        () => {
          loadWebhookLogs()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(logsChannel)
    }
  }, [accountId, profileLoading])

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
    switch (status) {
      case 'approved': return 'bg-green-500/10 text-green-500 hover:bg-green-500/15'
      case 'pending': return 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/15'
      case 'rejected': return 'bg-destructive/10 text-destructive hover:bg-destructive/15'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <section className="max-w-4xl space-y-6 animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Shopify Integration"
        description="Connect your wacrm platform to Shopify to synchronize contacts, recover abandoned checkouts, and dispatch transactional notifications."
      />

      <div className="grid gap-6 md:grid-cols-3">
        {/* Connection Status Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <ShoppingBag className="size-4 text-primary" />
              Store Connection
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Verify the integration status with your Shopify Admin API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Store URL: <span className="font-mono text-xs">{storeDomain}</span>
                  </p>
                  {shopName && (
                    <p className="text-xs text-muted-foreground">
                      Connected Store: <strong>{shopName}</strong> ({shopDomain})
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  {connectionStatus === 'checking' && (
                    <span className="flex items-center gap-1 text-amber-500">
                      <Loader2 className="size-3.5 animate-spin" /> Checking
                    </span>
                  )}
                  {connectionStatus === 'connected' && (
                    <span className="flex items-center gap-1 text-green-500">
                      <CheckCircle2 className="size-3.5" /> Connected
                    </span>
                  )}
                  {connectionStatus === 'disconnected' && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle className="size-3.5" /> Disconnected
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => checkConnection(false)}
                disabled={checking}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {checking ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={loadWebhookLogs}
                className="border-border text-foreground hover:bg-muted"
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Configuration Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Setup Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5 text-xs">
            <div className="flex items-start gap-2">
              <div className="rounded-full bg-primary/10 p-1 text-primary flex items-center justify-center size-5 text-[10px] font-bold">1</div>
              <p className="text-muted-foreground">
                Set up a <strong>Shopify Custom App</strong> in your store settings.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="rounded-full bg-primary/10 p-1 text-primary flex items-center justify-center size-5 text-[10px] font-bold">2</div>
              <p className="text-muted-foreground">
                Add environment variables for store credentials to your host env.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="rounded-full bg-primary/10 p-1 text-primary flex items-center justify-center size-5 text-[10px] font-bold">3</div>
              <p className="text-muted-foreground">
                Register webhooks to receive real-time cart and order events.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Opt-In Disclaimer Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex gap-3 text-xs text-foreground/90">
          <Info className="size-4 shrink-0 text-primary mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Compliance Note: Marketing Opt-in Constraint</p>
            <p className="text-muted-foreground leading-relaxed">
              WhatsApp messaging policies require explicit customer opt-in for promotional content. 
              <strong> Step 1 cart reminders</strong> run on transactional customer service context, but 
              <strong> Steps 2, 3, and all Browse Abandonment messages</strong> will only be sent to customers 
              who have `whatsapp_marketing_opt_in` toggled to `true`.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Drip Sequences Card */}
      <Card>
        <CardHeader>
          <CardTitle>Recovery sequences</CardTitle>
          <CardDescription>
            Multi-step customer nudges with automated conversion checks and discount code generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {sequencesLoading ? (
            <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Loading sequences...
            </div>
          ) : sequences.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">No sequences found.</div>
          ) : (
            <div className="space-y-6">
              {sequences.map((seq) => (
                <div key={seq.id} className="rounded-lg border border-border overflow-hidden">
                  {/* Sequence Master Header */}
                  <div className="bg-muted/40 p-4 border-b border-border flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{seq.sequence_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {seq.trigger_type === 'cart_abandoned' ? 'Drips triggered upon cart abandonment' : 'Identified visitor browse triggers'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={seq.is_active ? 'bg-green-500/10 text-green-500 border-none' : 'bg-muted text-muted-foreground border-none'}>
                        {seq.is_active ? 'Sequence Active' : 'Sequence Inactive'}
                      </Badge>
                      <button
                        onClick={() => updateSequence(seq.id, { is_active: !seq.is_active })}
                        className={`text-xs font-semibold py-1 px-3 rounded border transition-colors ${
                          seq.is_active
                            ? 'bg-destructive/10 border-destructive/20 text-destructive hover:bg-destructive/20'
                            : 'bg-primary border-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {seq.is_active ? 'Deactivate' : 'Activate Sequence'}
                      </button>
                    </div>
                  </div>

                  {/* Steps List */}
                  <div className="divide-y divide-border">
                    {seq.steps.map((step) => {
                      const recipe = SHOPIFY_TEMPLATE_LIBRARY.find((r) => r.template_name === step.template_name)
                      const isExpanded = expandedStepId === step.id

                      return (
                        <div key={step.id} className="p-4 space-y-3 bg-card/10 hover:bg-card/20 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-xs text-foreground">Step {step.step_order}</p>
                                <Badge className={`text-[9px] py-0.5 px-1.5 font-semibold capitalize border-none ${getStatusBadgeVariant(step.meta_approval_status)}`}>
                                  {step.meta_approval_status.replace('_', ' ')}
                                </Badge>
                                {step.is_active && step.meta_approval_status === 'approved' && (
                                  <Badge className="bg-green-500/10 text-green-500 text-[9px] font-semibold border-none">Step Active</Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground font-mono">Template: {step.template_name}</p>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] border-border text-foreground hover:bg-muted px-2"
                                onClick={() => copyTemplateText(recipe?.body || '')}
                              >
                                <Copy className="mr-1 size-3" /> Copy
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] border-border text-foreground hover:bg-muted p-0"
                              >
                                <a
                                  href="https://business.facebook.com/wa/manage/message-templates/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-center px-2.5"
                                >
                                  Meta <ExternalLink className="ml-1 size-3" />
                                </a>
                              </Button>

                              {step.meta_approval_status !== 'approved' || !step.is_active ? (
                                <Button
                                  size="sm"
                                  className="h-7 text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 px-2"
                                  onClick={() => updateStep(step.id, { meta_approval_status: 'approved', is_active: true })}
                                >
                                  Mark Approved
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-[10px] px-2"
                                  onClick={() => updateStep(step.id, { is_active: false })}
                                >
                                  Disable Step
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                              >
                                {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                              </Button>
                            </div>
                          </div>

                          {/* Template preview */}
                          <div className="bg-muted/40 border border-border/60 rounded p-2.5 text-[11px] space-y-1">
                            <p className="font-semibold text-[9px] text-muted-foreground uppercase tracking-wider">Template Copy</p>
                            <p className="italic font-mono leading-relaxed text-muted-foreground">{recipe?.body}</p>
                            {recipe?.variables && (
                              <p className="text-[9px] text-muted-foreground mt-0.5 leading-normal">
                                Variables: {recipe.variables.map((v, index) => (
                                  <span key={v} className="inline-block bg-muted border border-border px-0.5 py-px rounded font-mono mr-1">
                                    {`{{${index + 1}}}`} &rarr; {v}
                                  </span>
                                ))}
                              </p>
                            )}
                          </div>

                          {/* Step advanced settings */}
                          {isExpanded && (
                            <div className="border-t border-border pt-3 mt-1 grid gap-4 sm:grid-cols-2 animate-in slide-in-from-top-1 duration-200 text-xs">
                              <div className="space-y-1">
                                <label className="font-semibold text-foreground flex items-center gap-1">
                                  <Clock className="size-3 text-primary" />
                                  Delay From Previous Step (Minutes)
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    min="0"
                                    defaultValue={step.delay_minutes_from_previous_step}
                                    onBlur={(e) => {
                                      const val = parseInt(e.target.value) || 0
                                      if (val !== step.delay_minutes_from_previous_step) {
                                        updateStep(step.id, { delay_minutes_from_previous_step: val })
                                      }
                                    }}
                                    className="w-24 h-7 px-2 rounded border border-border bg-card text-foreground"
                                  />
                                  <span className="text-[10px] text-muted-foreground self-center">
                                    {step.step_order === 1 ? 'Delay after trigger action' : `Delay after Step ${step.step_order - 1}`}
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="font-semibold text-foreground flex items-center gap-1">
                                  <Settings className="size-3 text-primary" />
                                  Meta Status Override
                                </label>
                                <div className="flex flex-wrap gap-1">
                                  {(['not_submitted', 'pending', 'approved', 'rejected'] as const).map((st) => (
                                    <button
                                      key={st}
                                      onClick={() => updateStep(step.id, { meta_approval_status: st })}
                                      className={`text-[9px] py-0.5 px-2 rounded border capitalize transition-colors ${
                                        step.meta_approval_status === st
                                          ? 'bg-primary border-primary text-primary-foreground'
                                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                                      }`}
                                    >
                                      {st.replace('_', ' ')}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactional Notification Rules Card */}
      <Card>
        <CardHeader>
          <CardTitle>Transactional notifications</CardTitle>
          <CardDescription>
            Configure single-message notification updates triggered on Shopify order events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rulesLoading ? (
            <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Loading transactional rules...
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">No transactional rules found.</div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {rules.map((rule) => {
                const recipe = SHOPIFY_TEMPLATE_LIBRARY.find((r) => r.template_name === rule.template_name)

                return (
                  <div key={rule.id} className="p-4 space-y-3 bg-card/20 hover:bg-card/40 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-xs text-foreground">{getTriggerLabel(rule.trigger_type)}</p>
                          <Badge className={`text-[9px] py-0.5 px-1.5 font-semibold capitalize border-none ${getStatusBadgeVariant(rule.meta_approval_status)}`}>
                            {rule.meta_approval_status.replace('_', ' ')}
                          </Badge>
                          {rule.is_active && rule.meta_approval_status === 'approved' && (
                            <Badge className="bg-green-500/10 text-green-500 text-[9px] font-semibold border-none">Active</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono">Template: {rule.template_name}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] border-border text-foreground hover:bg-muted px-2"
                          onClick={() => copyTemplateText(recipe?.body || '')}
                        >
                          <Copy className="mr-1 size-3" /> Copy
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] border-border text-foreground hover:bg-muted p-0"
                        >
                          <a
                            href="https://business.facebook.com/wa/manage/message-templates/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center px-2.5"
                          >
                            Meta <ExternalLink className="ml-1 size-3" />
                          </a>
                        </Button>

                        {!rule.is_active || rule.meta_approval_status !== 'approved' ? (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 px-2"
                            onClick={() => updateRule(rule.id, { meta_approval_status: 'approved', is_active: true })}
                          >
                            Mark Approved & Activate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-[10px] px-2"
                            onClick={() => updateRule(rule.id, { is_active: false })}
                          >
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Template preview */}
                    <div className="bg-muted/40 border border-border/60 rounded p-2 text-[11px] space-y-1">
                      <p className="italic font-mono leading-relaxed text-muted-foreground">{recipe?.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook Activity Feed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Webhook Deliveries</CardTitle>
            <CardDescription>
              A log of inbound webhook hits received from Shopify. Updates in real-time.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Loading logs...
            </div>
          ) : webhookLogs.length === 0 ? (
            <div className="flex h-24 flex-col items-center justify-center rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-sm font-medium text-muted-foreground">No webhook events received yet</p>
              <p className="text-xs text-muted-foreground mt-1">Once you connect your storefront and register webhooks, activity will display here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-medium">
                    <th className="py-2.5">Topic</th>
                    <th className="py-2.5">Status</th>
                    <th className="py-2.5">Date / Time</th>
                    <th className="py-2.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {webhookLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/40">
                      <td className="py-2.5 font-medium font-mono text-foreground">{log.topic}</td>
                      <td className="py-2.5">
                        <Badge
                          variant={log.status === 'success' ? 'secondary' : (log.status === 'skipped_not_activated' ? 'outline' : 'destructive')}
                          className={
                            log.status === 'success'
                              ? 'bg-green-500/10 text-green-500 hover:bg-green-500/15 border-none'
                              : log.status === 'skipped_not_activated'
                                ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/15 border-none'
                                : 'bg-destructive/10 text-destructive border-none'
                          }
                        >
                          {log.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 max-w-xs truncate text-muted-foreground">
                        {log.error_message || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
