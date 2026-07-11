"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { createBrowserClient } from "@supabase/ssr"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "sonner"
import {
  ShoppingBag,
  Loader2,
  CheckCircle2,
  Percent,
  DollarSign,
  Search,
  Copy,
  RefreshCw,
  Plus,
  Check,
  Megaphone,
  Calendar,
  Reply,
  Bot,
  Pencil,
  Trash2,
  Lock as LockIcon,
  Monitor,
  Smartphone,
  Globe,
  UserCheck,
  Eye,
  Users as UsersIcon
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { SHOPIFY_TEMPLATE_LIBRARY } from "@/lib/shopify/whatsapp-template-library"
import { extractVariableIndices } from "@/lib/whatsapp/template-validators"
import InboxPage from "@/app/(dashboard)/inbox/page"
import PipelinesPage from "@/app/(dashboard)/pipelines/page"
import Image from "next/image"
import type { Broadcast } from "@/types"

interface VisitorSession {
  id: string
  visitor_id: string
  session_id: string
  device_type: string
  referrer_source: string
  session_start: string
  pages_viewed_count: number
  cart_events_count: number
  last_page: string | null
  associated_phone: string | null
  associated_email: string | null
  associated_name: string | null
  contact_name: string | null
  contact_id: string | null
  is_identified: boolean
}

interface VisitorStats {
  total: number
  mobile: number
  identified: number
  linked_to_contact: number
}

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
  financial_status: string
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
  category?: string
  language?: string
  header_type?: string
  header_media_url?: string
}

export default function ShopifyDashboardPage() {
  const supabase = createClient()
  const { accountId, user, accountRole } = useAuth()

  // Tabs: 'overview', 'visitors', 'templates', 'confirm_msg', 'adv_features', 'settings', 'billing', 'chats', 'pipelines'
  const [activeTab, setActiveTab] = useState<'overview' | 'visitors' | 'templates' | 'confirm_msg' | 'adv_features' | 'settings' | 'billing' | 'chats' | 'pipelines'>('overview')
  const [activeSubTab, setActiveSubTab] = useState<'broadcast' | 'schedule' | 'auto_reply' | 'flow_bot'>('broadcast')

  // Force agents to the Chats tab only
  useEffect(() => {
    if (accountRole === 'agent') {
      setActiveTab('chats')
    }
  }, [accountRole])

  const [loading, setLoading] = useState(true)
  const [checkouts, setCheckouts] = useState<Checkout[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])
  const [sequences, setSequences] = useState<AutomationSequence[]>([])
  const [currentPlan, setCurrentPlan] = useState<'basic' | 'growth' | 'scale'>('growth')

  // Visitor sessions state
  const [visitorSessions, setVisitorSessions] = useState<VisitorSession[]>([])
  const [visitorsLoading, setVisitorsLoading] = useState(false)
  const [visitorSearch, setVisitorSearch] = useState('')
  const [visitorStats, setVisitorStats] = useState<VisitorStats>({ total: 0, mobile: 0, identified: 0, linked_to_contact: 0 })
  const [visitorsLoaded, setVisitorsLoaded] = useState(false)
  
  // Custom templates and list of templates
  const [customTemplates, setCustomTemplates] = useState<Record<string, CustomTemplate>>({})
  const [templatesList, setTemplatesList] = useState<CustomTemplate[]>([])
  const [templatesSearchQuery, setTemplatesSearchQuery] = useState('')
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('wacrm_cod_confirmation_v1')

  // Broadcasts list state
  const [broadcastsList, setBroadcastsList] = useState<Broadcast[]>([])

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

  // Autometick-style configurations
  const [codActive, setCodActive] = useState(true)
  const [codDelay, setCodDelay] = useState<'Instant' | '5 min' | '1 hr' | '10 hr'>('Instant')
  const [codResend, setCodResend] = useState(true)
  const [codResendDelay, setCodResendDelay] = useState<'1 hr' | '5 hr' | '10 hr'>('1 hr')

  const [prepaidActive, setPrepaidActive] = useState(true)
  const [prepaidDelay, setPrepaidDelay] = useState<'Instant' | '5 min' | '1 hr' | '10 hr'>('Instant')

  const [fulfilledActive, setFulfilledActive] = useState(true)
  const [fulfilledDelay, setFulfilledDelay] = useState<'Instant' | '5 min' | '1 hr' | '10 hr'>('Instant')

  // Cart Recovery steps delay states
  const [step1Delay, setStep1Delay] = useState<'30 min' | '1 hr' | '2 hr' | '10 hr'>('30 min')
  const [step2Delay, setStep2Delay] = useState<'12 hr' | '24 hr' | '36 hr' | '48 hr'>('24 hr')
  const [step3Delay, setStep3Delay] = useState<'24 hr' | '48 hr' | '72 hr' | '96 hr'>('48 hr')

  // Phone preview tabs
  const [phonePreviewTab, setPhonePreviewTab] = useState<'COD' | 'Prepaid' | 'Cart'>('COD')
  const [phonePreviewStep, setPhonePreviewStep] = useState<'Step 1' | 'Step 2' | 'Step 3'>('Step 1')

  // Timeline selector for broadcasts overview
  const [broadcastTimeline, setBroadcastTimeline] = useState<'month' | 'last_month' | '3_months' | '12_months' | 'all'>('month')

  // Auto Status Reply States
  const [autoReplyKeyword, setAutoReplyKeyword] = useState('Order Status')
  const [autoReplyText, setAutoReplyText] = useState('Hi {{1}}, your order #{{2}} is currently {{3}}. Track here: {{4}}')

  // Agent Management States
  const [agentName, setAgentName] = useState('')
  const [agentEmail, setAgentEmail] = useState('')
  const [agentPassword, setAgentPassword] = useState('')
  const [creatingAgent, setCreatingAgent] = useState(false)
  const [agentsList, setAgentsList] = useState<{ id: string; name: string; email: string }[]>([])

  const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || "divyaprabhafoods.myshopify.com"

  const loadData = useCallback(async () => {
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
      // Fallback/merge with default Shopify WhatsApp templates library
      const defaultTemplates: CustomTemplate[] = [
        {
          name: 'wacrm_cart_abandoned_v1',
          body_text: "Hey {{1}}! 😉\n\nStill thinking about {{2}}? We saw you checking it out and saved it in your cart at {{3}}! Grab it now before it sells out.\n\n✅ Fresh & hygienically packed\n✅ Chemical preservative free\n✅ Free shipping on orders above ₹499\n\n👉 Click below to complete your checkout in 1-click:\n{{4}}\n\nHappy shopping! 🛍️",
          status: 'DRAFT',
          category: 'Marketing',
          language: 'en_US',
          header_type: 'image',
          header_media_url: 'https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=800'
        },
        {
          name: 'wacrm_cart_reminder_step2_v1',
          body_text: "Hey {{1}}! 🤔\n\nStill thinking about {{2}}? Your cart is waiting for you! Order today at only ₹{{3}} and experience authentic dadi-nani ka swad!\n\n✅ Hygienic packaging\n✅ Real ingredients, no preservatives\n✅ Cash on Delivery (COD) available\n\nReply STOP to opt out.",
          status: 'DRAFT',
          category: 'Marketing',
          language: 'en_US',
          header_type: 'image',
          header_media_url: 'https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=800'
        },
        {
          name: 'wacrm_cart_reminder_step3_v1',
          body_text: "Hey {{1}}! 🎁\n\nStill thinking about {{2}}? Complete your order here: {{3}} and use code {{4}} for a special 10% OFF!\n\n✅ Handmade by local women\n✅ Guaranteed premium quality\n✅ Super fast doorstep delivery\n\nReply STOP to opt out.",
          status: 'DRAFT',
          category: 'Marketing',
          language: 'en_US',
          header_type: 'image',
          header_media_url: 'https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=800'
        },
        {
          name: 'wacrm_browse_abandoned_v1',
          body_text: "Hey {{1}}! 👀\n\nWe saw you checking out {{2}} at only ₹{{3}}. It's one of our best-sellers!\n\n✅ Handcrafted with care & love\n✅ Hygienic glass bottle packaging\n✅ Cash on Delivery (COD) available\n\n👉 Grab yours here before it's gone:\n{{4}}\n\nReply STOP to opt out.",
          status: 'DRAFT',
          category: 'Marketing',
          language: 'en_US',
          header_type: 'image',
          header_media_url: 'https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=800'
        },
        {
          name: 'wacrm_order_confirmed_v1',
          body_text: "Hey {{1}}! Woohoo! 🎉 Your order #{{2}} of ₹{{3}} is confirmed!\n\nWe are preparing your fresh treats with lots of love. We'll send you tracking details as soon as it ships! 🚚✨\n\n✅ Handcrafted with care\n✅ Preservative free\n✅ Fast doorstep delivery\n\nThank you for supporting handcrafted food! ❤️",
          status: 'DRAFT',
          category: 'Utility',
          language: 'en_US',
          header_type: 'image',
          header_media_url: 'https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=800'
        },
        {
          name: 'wacrm_order_shipped_v1',
          body_text: "Great news, {{1}}! 🚚\n\nYour order #{{2}} from DivyaPrabha Foods is on its way to you!\n\n✅ Freshness sealed\n✅ Contactless delivery\n✅ Safe transit tracking\n\n👉 Track your package here:\n{{3}} 🎉",
          status: 'DRAFT',
          category: 'Utility',
          language: 'en_US',
          header_type: 'image',
          header_media_url: 'https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=800'
        },
        {
          name: 'wacrm_order_delivered_v1',
          body_text: "Hey {{1}}! Delivered! 🎁\n\nYour DivyaPrabha Foods order #{{2}} has been successfully delivered! We hope you absolutely love it.\n\n✅ Freshness & taste guaranteed\n✅ 100% natural ingredients\n\nReply here if you need any help! ❤️",
          status: 'DRAFT',
          category: 'Utility',
          language: 'en_US',
          header_type: 'image',
          header_media_url: 'https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=800'
        },
        {
          name: 'wacrm_cod_confirmation_v1',
          body_text: "Hey {{1}}! 😍 Your order #{{2}} of ₹{{3}} from DivyaPrabha Foods is almost ready to ship.\n\nSince you chose Cash on Delivery, please confirm below to lock in fast shipping! 🚀\n\n✅ Fresh & hygienically packed\n✅ 100% natural ingredients\n\n👇 Click 'Yes, confirm order' below to ship it today!",
          status: 'DRAFT',
          category: 'Utility',
          language: 'en_US',
          header_type: 'image',
          header_media_url: 'https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=800'
        }
      ]

      const mapping: Record<string, CustomTemplate> = {}
      defaultTemplates.forEach((t) => {
        mapping[t.name] = t
      })

      if (user) {
        // Clean up legacy default templates with invalid 'en' language code
        await supabase
          .from('message_templates')
          .delete()
          .eq('user_id', user.id)
          .eq('language', 'en')
          .like('name', 'wacrm_%')

        const { data: msgTemplates } = await supabase
          .from('message_templates')
          .select('name, body_text, status, category, language, header_type, header_media_url')
          .eq('user_id', user.id)
        
        // Seed default templates if they are missing in the database
        const existingNames = new Set((msgTemplates || []).map((t) => t.name))
        const missingTemplates = defaultTemplates.filter((dt) => !existingNames.has(dt.name))

        // Detect if any existing draft templates contain the old copywriting
        const draftTemplatesToUpdate = (msgTemplates || []).filter((t) => {
          const dt = defaultTemplates.find((dt) => dt.name === t.name)
          return dt && t.status === 'DRAFT' && t.body_text !== dt.body_text
        })

        if ((missingTemplates.length > 0 || draftTemplatesToUpdate.length > 0) && accountId) {
          const insertRows = [
            ...missingTemplates.map((dt) => ({
              account_id: accountId,
              user_id: user.id,
              name: dt.name,
              body_text: dt.body_text,
              status: 'DRAFT',
              category: dt.category || 'Marketing',
              language: dt.language || 'en',
              header_type: dt.header_type || null,
              header_media_url: dt.header_media_url || null
            })),
            ...draftTemplatesToUpdate.map((t) => {
              const dt = defaultTemplates.find((dt) => dt.name === t.name)!
              return {
                account_id: accountId,
                user_id: user.id,
                name: dt.name,
                body_text: dt.body_text,
                status: 'DRAFT',
                category: dt.category || 'Marketing',
                language: dt.language || 'en',
                header_type: dt.header_type || null,
                header_media_url: dt.header_media_url || null
              }
            })
          ]

          await supabase.from('message_templates').upsert(insertRows, { onConflict: 'user_id,name,language' })

          // Re-fetch templates
          const { data: refetchedTemplates } = await supabase
            .from('message_templates')
            .select('name, body_text, status, category, language, header_type, header_media_url')
            .eq('user_id', user.id)

          if (refetchedTemplates) {
            refetchedTemplates.forEach((t) => {
              mapping[t.name] = {
                name: t.name,
                body_text: t.body_text,
                status: t.status,
                category: t.category || 'Marketing',
                language: t.language || 'en_US',
                header_type: t.header_type || undefined,
                header_media_url: t.header_media_url || undefined
              }
            })
          }
        } else {
          if (msgTemplates) {
            msgTemplates.forEach((t) => {
              mapping[t.name] = {
                name: t.name,
                body_text: t.body_text,
                status: t.status,
                category: t.category || 'Marketing',
                language: t.language || 'en_US',
                header_type: t.header_type || undefined,
                header_media_url: t.header_media_url || undefined
              }
            })
          }
        }
      }

      setCustomTemplates(mapping)
      setTemplatesList(Object.values(mapping))

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

      // 7. Fetch broadcasts
      const { data: allBroadcasts } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
      setBroadcastsList(allBroadcasts || [])

      // 8. Fetch agents (profiles with role === 'agent')
      const { data: agentsData, error: agentsErr } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, account_role, created_at')
        .eq('account_id', accountId)
        .eq('account_role', 'agent')
        .order('created_at', { ascending: true })
      if (!agentsErr && agentsData) {
        setAgentsList(agentsData.map(a => ({
          id: a.user_id,
          name: a.full_name || 'Shopify Agent',
          email: a.email || '—'
        })))
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[shopify-dashboard] error loading dashboard:', errMsg)
      toast.error('Failed to load Shopify data.')
    } finally {
      setLoading(false)
    }
  }, [accountId, supabase, user])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Load visitor sessions (lazy — only when Visitors tab is opened)
  const loadVisitorSessions = useCallback(async () => {
    if (visitorsLoading) return
    setVisitorsLoading(true)
    try {
      const res = await fetch('/api/shopify/visitor-sessions')
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to load visitor sessions.')
        return
      }
      setVisitorSessions(data.sessions || [])
      setVisitorStats(data.stats || { total: 0, mobile: 0, identified: 0, linked_to_contact: 0 })
      setVisitorsLoaded(true)
    } catch (err: unknown) {
      toast.error('Error loading visitor sessions.')
    } finally {
      setVisitorsLoading(false)
    }
  }, [visitorsLoading])

  // Auto-load visitor sessions when the Visitors tab becomes active
  useEffect(() => {
    if (activeTab === 'visitors' && !visitorsLoaded) {
      loadVisitorSessions()
    }
  }, [activeTab, visitorsLoaded, loadVisitorSessions])

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

  const filteredTemplates = templatesList.filter((temp) => {
    const query = templatesSearchQuery.toLowerCase()
    return temp.name.toLowerCase().includes(query) || temp.body_text.toLowerCase().includes(query)
  })

  // Calculations for Metrics
  const totalCarts = checkouts.length
  const recoveredCarts = checkouts.filter(c => c.status === 'recovered').length
  const recoveryRate = totalCarts > 0 ? ((recoveredCarts / totalCarts) * 100).toFixed(1) : '0.0'
  const recoveredRevenue = checkouts
    .filter(c => c.status === 'recovered')
    .reduce((sum, c) => sum + Number(c.total_price), 0)

  // Broadcasts Overview sums
  const totalSentBroadcasts = broadcastsList.reduce((sum, b) => sum + (b.total_recipients || 0), 0)
  const totalDeliveredBroadcasts = broadcastsList.reduce((sum, b) => sum + (b.delivered_count || 0), 0)
  const totalFailedBroadcasts = broadcastsList.reduce((sum, b) => sum + (b.failed_count || ((b.total_recipients || 0) - (b.delivered_count || 0))), 0)

  const handleManualNotification = async (checkoutId: string) => {
    try {
      const res = await fetch('/api/shopify/checkout/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_id: checkoutId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send recovery nudge.')
      }
      toast.success('Manual recovery nudge sent successfully!')
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Error triggering nudge.')
    }
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    toast.success('Checkout recovery URL copied!')
  }

  const changePlan = (plan: 'basic' | 'growth' | 'scale') => {
    setCurrentPlan(plan)
    toast.success(`Switched subscription plan to ${plan.toUpperCase()}`)
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
      const templateRec = customTemplates[editingTemplateName]
      const currentStatus = templateRec?.status || 'DRAFT'
      const category = templateRec?.category || 'Marketing'
      const { error: upsertErr } = await supabase
        .from('message_templates')
        .upsert({
          user_id: user.id,
          name: editingTemplateName,
          body_text: editedBodyText,
          status: currentStatus,
          category,
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

      toast.success('Configuration saved successfully!')
      setEditingTemplateName(null)
      loadData()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Failed to save configuration: ' + errMsg)
    }
  }

  const saveAutometickRule = (type: 'cod' | 'prepaid' | 'fulfilled') => {
    toast.success(`${type.toUpperCase()} confirmation settings saved successfully!`)
  }

  const handleCreateAgent = async () => {
    if (!agentName.trim() || !agentEmail.trim() || !agentPassword.trim()) {
      toast.error('All fields (Name, Email, Password) are required.')
      return
    }
    if (agentPassword.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }
    setCreatingAgent(true)
    try {
      const tempSupabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      )

      // 1. Sign up new agent user in auth without affecting current logged in admin session
      const { data, error } = await tempSupabase.auth.signUp({
        email: agentEmail.trim(),
        password: agentPassword.trim(),
        options: {
          data: {
            full_name: agentName.trim()
          }
        }
      })

      if (error) throw error

      if (!data?.user) {
        throw new Error('User creation succeeded but no user data returned.')
      }

      // 2. Insert user profile as an agent associated with the current account
      const { error: profileErr } = await supabase
        .from('profiles')
        .insert({
          user_id: data.user.id,
          account_id: accountId,
          full_name: agentName.trim(),
          email: agentEmail.trim(),
          account_role: 'agent'
        })

      if (profileErr) throw profileErr

      toast.success('Agent created successfully!')
      setAgentName('')
      setAgentEmail('')
      setAgentPassword('')
      loadData()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Failed to create agent: ' + errMsg)
    } finally {
      setCreatingAgent(false)
    }
  }

  const handleDeleteAgent = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this agent?')) return
    try {
      const response = await fetch(`/api/account/members/${userId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to delete agent')
      }
      toast.success('Agent removed successfully!')
      loadData()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Failed to remove agent: ' + errMsg)
    }
  }

const DEFAULT_SAMPLE_VALUES: Record<string, string[]> = {
  wacrm_cod_confirmation_v1: ['Jesal Patel', '1234', '1499'],
  wacrm_order_confirmed_v1: ['Jesal Patel', '1234', '1499'],
  wacrm_cart_abandoned_v1: ['Jesal Patel', 'Organic Jam Combo', 'Divyaprabha Foods', 'https://divyaprabhafoods.com/checkout'],
  wacrm_cart_reminder_step2_v1: ['Jesal Patel', 'Organic Jam Combo', '1499'],
  wacrm_cart_reminder_step3_v1: ['Jesal Patel', 'Organic Jam Combo', 'https://divyaprabhafoods.com/checkout', 'WELCOME10'],
  wacrm_browse_abandoned_v1: ['Jesal Patel', 'Organic Jam Combo', '1499', 'https://divyaprabhafoods.com/checkout'],
  wacrm_order_shipped_v1: ['Jesal Patel', '1234', 'https://track.com/12345'],
  wacrm_order_delivered_v1: ['Jesal Patel', '1234'],
}

function getAutoSampleValues(templateName: string, varCount: number): string[] {
  const defaults = DEFAULT_SAMPLE_VALUES[templateName] || []
  const samples: string[] = []
  for (let i = 0; i < varCount; i++) {
    samples.push(defaults[i] || `Value ${i + 1}`)
  }
  return samples
}

  const submitToMeta = async () => {
    if (!user || !editingTemplateName) return
    setSubmittingMeta(true)
    try {
      const templateRec = customTemplates[editingTemplateName]
      const category = templateRec?.category || 'Marketing'
      const language = templateRec?.language || 'en'
      
      let buttons: any[] | undefined = undefined
      if (editingTemplateName === 'wacrm_cod_confirmation_v1') {
        buttons = [
          { type: 'QUICK_REPLY', text: 'Yes, confirm order' },
          { type: 'QUICK_REPLY', text: 'Cancel order' }
        ]
      } else if (editingTemplateName.startsWith('wacrm_')) {
        let btnText = 'Shop Now'
        if (editingTemplateName.includes('shipped')) {
          btnText = 'Track Order'
        } else if (editingTemplateName.includes('confirmed')) {
          btnText = 'View Order'
        } else if (editingTemplateName.includes('cart') || editingTemplateName.includes('abandoned')) {
          btnText = 'Complete Checkout'
        }
        buttons = [
          { type: 'URL', text: btnText, url: 'https://divyaprabhafoods.com' }
        ]
      }
      
      const bodyVars = extractVariableIndices(editedBodyText)
      const sample_values: any = {}
      if (bodyVars.length > 0) {
        sample_values.body = getAutoSampleValues(editingTemplateName, bodyVars.length)
      }
      
      toast.info('Submitting WhatsApp template to Meta for approval...')
      
      const res = await fetch('/api/whatsapp/templates/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingTemplateName,
          category,
          language,
          body_text: editedBodyText,
          header_type: editingTemplateName.startsWith('wacrm_') ? 'image' : undefined,
          header_media_url: editingTemplateName.startsWith('wacrm_') ? 'https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=800' : undefined,
          buttons,
          sample_values: Object.keys(sample_values).length > 0 ? sample_values : undefined
        })
      })
      
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || `Submission failed (HTTP ${res.status})`)
      }
      
      toast.success(
        data.dry_run
          ? 'Template submitted successfully (dry-run — no Meta call)'
          : 'Submitted to Meta — typical review time is 24 hours. Status updates automatically.'
      )
      
      setEditingTemplateName(null)
      loadData()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Meta verification submission failed: ' + errMsg)
    } finally {
      setSubmittingMeta(false)
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

  const getSelectedPreviewText = () => {
    if (phonePreviewTab === 'COD') {
      const customBody = customTemplates['wacrm_cod_confirmation_v1']?.body_text
      return customBody
        ? customBody.replace(/\{\{1\}\}/g, 'Jesal Patel').replace(/\{\{2\}\}/g, '1234').replace(/\{\{3\}\}/g, '₹1,499')
        : "Hi Jesal Patel, please confirm your Cash on Delivery order #1234 of ₹1,499 by clicking the button below."
    } else if (phonePreviewTab === 'Prepaid') {
      const customBody = customTemplates['wacrm_order_confirmed_v1']?.body_text
      return customBody
        ? customBody.replace(/\{\{1\}\}/g, 'Jesal Patel').replace(/\{\{2\}\}/g, '1234').replace(/\{\{3\}\}/g, '₹1,499')
        : "Hi Jesal Patel, your order #1234 of ₹1,499 is confirmed! We'll notify you when it ships."
    } else {
      const customBody = customTemplates['wacrm_cart_abandoned_v1']?.body_text
      return customBody
        ? customBody.replace(/\{\{1\}\}/g, 'Jesal Patel').replace(/\{\{2\}\}/g, 'Organic Jam Combo').replace(/\{\{3\}\}/g, 'Divyaprabha Foods').replace(/\{\{4\}\}/g, 'https://divyaprabhafoods.com/checkout')
        : "Hi Jesal Patel, you left Organic Jam Combo in your cart at Divyaprabha Foods. Complete your order here: https://divyaprabhafoods.com/checkout"
    }
  }

  const getSequenceStepPreviewText = (stepOrder: number) => {
    if (stepOrder === 1) {
      const customBody = customTemplates['wacrm_cart_abandoned_v1']?.body_text
      return customBody
        ? customBody.replace(/\{\{1\}\}/g, 'Jesal Patel').replace(/\{\{2\}\}/g, 'Organic Jam Combo').replace(/\{\{3\}\}/g, 'Divyaprabha Foods').replace(/\{\{4\}\}/g, 'https://divyaprabhafoods.com/checkout')
        : "Hi Jesal Patel, you left Organic Jam Combo in your cart at Divyaprabha Foods. Complete your order here: https://divyaprabhafoods.com/checkout"
    } else if (stepOrder === 2) {
      const customBody = customTemplates['wacrm_cart_reminder_step2_v1']?.body_text
      return customBody
        ? customBody.replace(/\{\{1\}\}/g, 'Jesal Patel').replace(/\{\{2\}\}/g, 'Organic Jam Combo').replace(/\{\{3\}\}/g, '₹1,499')
        : "Hi Jesal Patel, still thinking it over? Organic Jam Combo is waiting for you at ₹1,499. Reply STOP to stop these updates."
    } else {
      const customBody = customTemplates['wacrm_cart_reminder_step3_v1']?.body_text
      return customBody
        ? customBody.replace(/\{\{1\}\}/g, 'Jesal Patel').replace(/\{\{2\}\}/g, 'Organic Jam Combo').replace(/\{\{3\}\}/g, 'https://divyaprabhafoods.com/checkout').replace(/\{\{4\}\}/g, 'WELCOME10')
        : "Hi Jesal Patel, here's 10% off to help you decide: use code WELCOME10 on Organic Jam Combo, valid 24 hours. Complete your order: https://divyaprabhafoods.com/checkout. Reply STOP to stop these updates."
    }
  }

  const getSelectedTemplatePreview = () => {
    const template = templatesList.find(t => t.name === selectedTemplateName)
    if (!template) return "Select a template on the left to see preview here."
    
    return template.body_text
      .replace(/\{\{1\}\}/g, 'Rahul')
      .replace(/\{\{2\}\}/g, 'Organic Jam Combo')
      .replace(/\{\{3\}\}/g, '₹1,499')
      .replace(/\{\{4\}\}/g, 'WELCOME20')
  }

  return (
    <div className={cn("space-y-4 animate-in fade-in duration-200", (activeTab === 'chats' || activeTab === 'pipelines') && "space-y-0 h-[calc(100vh-3.5rem)] overflow-hidden -m-4 sm:-m-6")}>
      
      {activeTab !== 'chats' && activeTab !== 'pipelines' && (
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-4.5 text-primary" />
            <h1 className="text-sm font-bold tracking-tight text-foreground">Shopify Sales Channel</h1>
            {connectionStatus === 'connected' ? (
              <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/15 border-green-500/20 text-[9px] py-0 px-2 flex items-center gap-1 font-normal select-none">
                Live: {shopName || storeDomain}
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[9px] py-0 px-2 flex items-center gap-1 font-normal select-none">
                Disconnected
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="border-border hover:bg-muted h-7 px-2">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Tab Controls */}
      <div className={cn("flex border-b border-border text-sm overflow-x-auto whitespace-nowrap scrollbar-none", activeTab === 'chats' && "px-4 sm:px-6 py-2 bg-card")}>
        {accountRole !== 'agent' && (
          <>
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-4 font-medium border-b-2 transition-all ${
                activeTab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('visitors')}
              className={`py-3 px-4 font-medium border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'visitors' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Visitors</span>
              {visitorStats.total > 0 && (
                <span className="bg-primary/10 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full select-none">
                  {visitorStats.total}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`py-3 px-4 font-medium border-b-2 transition-all ${
                activeTab === 'templates' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Templates
            </button>
            <button
              onClick={() => setActiveTab('confirm_msg')}
              className={`py-3 px-4 font-medium border-b-2 transition-all ${
                activeTab === 'confirm_msg' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Confirm Msg
            </button>
            <button
              onClick={() => setActiveTab('adv_features')}
              className={`py-3 px-4 font-medium border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'adv_features' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Adv Features</span>
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[8px] font-extrabold px-1.5 py-0.5 rounded-full shadow-sm scale-90 whitespace-nowrap origin-left select-none">
                Growth / Scale
              </span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-3 px-4 font-medium border-b-2 transition-all ${
                activeTab === 'settings' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`py-3 px-4 font-medium border-b-2 transition-all ${
                activeTab === 'billing' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Billing
            </button>
            {currentPlan !== 'basic' && (
              <button
                onClick={() => setActiveTab('pipelines')}
                className={`py-3 px-4 font-medium border-b-2 transition-all ${
                  activeTab === 'pipelines' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Pipelines
              </button>
            )}
          </>
        )}
        <button
          onClick={() => setActiveTab('chats')}
          className={`py-3 px-4 font-medium border-b-2 transition-all ${
            activeTab === 'chats' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Chats
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
            <div className="space-y-6 animate-in fade-in duration-250">
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
            </div>
          )}

          {/* Tab 2: Visitors — Anonymous + Identified Visitor Sessions */}
          {activeTab === 'visitors' && (
            <div className="space-y-5 animate-in fade-in duration-250">

              {/* Stat Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Sessions</CardTitle>
                    <Globe className="size-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-foreground">{visitorStats.total}</div>
                    <p className="text-[10px] text-muted-foreground mt-1">All storefront visitor sessions recorded</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mobile Visitors</CardTitle>
                    <Smartphone className="size-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-foreground">{visitorStats.mobile}</div>
                    <p className="text-[10px] text-muted-foreground mt-1">Sessions from mobile devices</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identified</CardTitle>
                    <UserCheck className="size-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-foreground">{visitorStats.identified}</div>
                    <p className="text-[10px] text-muted-foreground mt-1">Visitors with phone or email captured</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Linked Contacts</CardTitle>
                    <UsersIcon className="size-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-extrabold text-foreground">{visitorStats.linked_to_contact}</div>
                    <p className="text-[10px] text-muted-foreground mt-1">Sessions matched to a CRM contact</p>
                  </CardContent>
                </Card>
              </div>

              {/* Session Table */}
              <Card>
                <CardHeader className="pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="size-4 text-primary" />
                      Visitor Sessions
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Anonymous and identified visitors on your Shopify storefront — latest 200 sessions
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search phone, email, page..."
                        value={visitorSearch}
                        onChange={(e) => setVisitorSearch(e.target.value)}
                        className="pl-8 h-8 border border-border rounded-md text-[11px] placeholder:text-muted-foreground bg-muted/40 text-foreground w-48 focus:outline-none focus:ring-1 focus:ring-primary px-2"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setVisitorsLoaded(false); loadVisitorSessions() }}
                      disabled={visitorsLoading}
                      className="border-border hover:bg-muted h-8 px-2"
                    >
                      {visitorsLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {visitorsLoading ? (
                    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 size-5 animate-spin text-primary" /> Loading visitor sessions...
                    </div>
                  ) : visitorSessions.length === 0 ? (
                    <div className="text-center py-14 text-sm text-muted-foreground">
                      <Globe className="size-10 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No visitor sessions found.</p>
                      <p className="text-xs mt-1 text-muted-foreground/70">Visitor sessions are captured via <code className="bg-muted px-1 rounded">visitor-identifier.js</code> on your Shopify storefront.</p>
                    </div>
                  ) : (() => {
                    const q = visitorSearch.toLowerCase()
                    const filtered = visitorSessions.filter(s =>
                      !q ||
                      (s.associated_phone || '').includes(q) ||
                      (s.associated_email || '').toLowerCase().includes(q) ||
                      (s.contact_name || '').toLowerCase().includes(q) ||
                      (s.last_page || '').toLowerCase().includes(q) ||
                      (s.referrer_source || '').toLowerCase().includes(q)
                    )
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-y border-border bg-muted/30 text-muted-foreground font-semibold">
                              <th className="py-2.5 px-4">Visitor</th>
                              <th className="py-2.5 px-4">Device</th>
                              <th className="py-2.5 px-4">Source</th>
                              <th className="py-2.5 px-4 text-center">Pages</th>
                              <th className="py-2.5 px-4 text-center">Cart</th>
                              <th className="py-2.5 px-4">Last Page</th>
                              <th className="py-2.5 px-4">CRM Contact</th>
                              <th className="py-2.5 px-4 text-right">When</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {filtered.map((s) => (
                              <tr key={s.session_id} className="hover:bg-muted/10 text-foreground">
                                {/* Visitor identity */}
                                <td className="py-2.5 px-4">
                                  {s.is_identified ? (
                                    <div>
                                      {s.associated_name && (
                                        <div className="font-semibold text-foreground">{s.associated_name}</div>
                                      )}
                                      {s.associated_phone && (
                                        <div className="text-[10px] text-muted-foreground font-mono">{s.associated_phone}</div>
                                      )}
                                      {s.associated_email && !s.associated_phone && (
                                        <div className="text-[10px] text-muted-foreground">{s.associated_email}</div>
                                      )}
                                      {!s.associated_phone && !s.associated_email && !s.associated_name && (
                                        <Badge className="bg-amber-500/10 text-amber-600 border-none text-[9px] py-0 px-1.5">Identified</Badge>
                                      )}
                                    </div>
                                  ) : (
                                    <Badge className="bg-muted text-muted-foreground border-none text-[9px] py-0 px-1.5 font-normal">Anonymous</Badge>
                                  )}
                                </td>
                                {/* Device */}
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-1.5">
                                    {s.device_type === 'Mobile' ? (
                                      <Smartphone className="size-3 text-blue-400" />
                                    ) : s.device_type === 'Tablet' ? (
                                      <Monitor className="size-3 text-purple-400" />
                                    ) : (
                                      <Monitor className="size-3 text-muted-foreground" />
                                    )}
                                    <span className="text-muted-foreground">{s.device_type}</span>
                                  </div>
                                </td>
                                {/* Referrer */}
                                <td className="py-2.5 px-4 text-muted-foreground max-w-[120px] truncate" title={s.referrer_source}>
                                  {s.referrer_source === 'Direct' ? (
                                    <span className="text-muted-foreground/60">Direct</span>
                                  ) : (
                                    (() => {
                                      try {
                                        return new URL(s.referrer_source).hostname.replace('www.', '')
                                      } catch {
                                        return s.referrer_source
                                      }
                                    })()
                                  )}
                                </td>
                                {/* Pages viewed */}
                                <td className="py-2.5 px-4 text-center">
                                  <span className={cn(
                                    "inline-block min-w-5 text-center rounded px-1.5 font-mono font-semibold text-[10px]",
                                    s.pages_viewed_count > 3 ? "bg-green-500/10 text-green-600" : "text-muted-foreground"
                                  )}>
                                    {s.pages_viewed_count}
                                  </span>
                                </td>
                                {/* Cart events */}
                                <td className="py-2.5 px-4 text-center">
                                  {s.cart_events_count > 0 ? (
                                    <span className="inline-block min-w-5 text-center rounded px-1.5 font-mono font-semibold text-[10px] bg-amber-500/10 text-amber-600">
                                      {s.cart_events_count}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40 text-[10px]">—</span>
                                  )}
                                </td>
                                {/* Last page */}
                                <td className="py-2.5 px-4 max-w-[140px]">
                                  {s.last_page ? (
                                    <span className="text-[10px] text-muted-foreground truncate block" title={s.last_page}>
                                      {(() => {
                                        try {
                                          return new URL(s.last_page).pathname
                                        } catch {
                                          return s.last_page
                                        }
                                      })()}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40 text-[10px]">—</span>
                                  )}
                                </td>
                                {/* Linked CRM contact */}
                                <td className="py-2.5 px-4">
                                  {s.contact_name ? (
                                    <Badge className="bg-green-500/10 text-green-700 border-none text-[9px] py-0 px-1.5 font-medium">
                                      {s.contact_name}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground/40 text-[10px]">—</span>
                                  )}
                                </td>
                                {/* Timestamp */}
                                <td className="py-2.5 px-4 text-right text-[10px] text-muted-foreground whitespace-nowrap">
                                  {new Date(s.session_start).toLocaleString('en-IN', {
                                    day: '2-digit', month: 'short',
                                    hour: '2-digit', minute: '2-digit', hour12: true
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {filtered.length === 0 && (
                          <div className="text-center py-8 text-xs text-muted-foreground">No sessions match your search.</div>
                        )}
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tab 3: Templates (WhatsApp Template Roster) */}
          {activeTab === 'templates' && (
            <div className="grid gap-6 lg:grid-cols-5 items-start">
              {/* Left side: List of Meta Templates (3/5 width) */}
              <Card className="lg:col-span-3">
                <CardHeader className="pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <span>WhatsApp Templates</span>
                      {templatesList.length >= (currentPlan === 'basic' ? 10 : currentPlan === 'growth' ? 20 : 50) && (
                        <Badge className="bg-destructive/10 text-destructive border-none text-[9px] py-0 px-2 font-normal select-none">
                          Limit Reached ({templatesList.length}/{currentPlan === 'basic' ? 10 : currentPlan === 'growth' ? 20 : 50})
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>Approved Meta templates linked to your WhatsApp Business API.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search templates..."
                        value={templatesSearchQuery}
                        onChange={(e) => setTemplatesSearchQuery(e.target.value)}
                        className="pl-8 h-8 border-border text-[11px] placeholder:text-muted-foreground bg-muted/40 text-foreground w-40"
                      />
                    </div>
                    <Button 
                      size="sm" 
                      className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs font-bold text-white px-3 flex items-center gap-1"
                      onClick={() => {
                        const limit = currentPlan === 'basic' ? 10 : currentPlan === 'growth' ? 20 : 50
                        if (templatesList.length >= limit) {
                          toast.error(`Template limit reached for your ${currentPlan.toUpperCase()} plan (${templatesList.length}/${limit}). Please upgrade on the Billing tab to create more.`)
                          return
                        }
                        toast.info("Redirecting to Meta Template Builder...")
                      }}
                    >
                      <Plus className="size-3.5" /> Create
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredTemplates.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground">No templates found.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-y border-border bg-muted/30 text-muted-foreground font-semibold">
                            <th className="py-2.5 px-4">Template Name</th>
                            <th className="py-2.5 px-4">Category</th>
                            <th className="py-2.5 px-4">Language</th>
                            <th className="py-2.5 px-4">Status</th>
                            <th className="py-2.5 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredTemplates.map((temp) => (
                            <tr 
                              key={temp.name} 
                              className={cn(
                                "hover:bg-muted/10 text-foreground cursor-pointer transition-colors",
                                selectedTemplateName === temp.name && "bg-muted/35 font-medium"
                              )}
                              onClick={() => setSelectedTemplateName(temp.name)}
                            >
                              <td className="py-2.5 px-4 font-mono truncate max-w-[150px]">{temp.name}</td>
                              <td className="py-2.5 px-4 capitalize">{temp.category?.toLowerCase() || 'marketing'}</td>
                              <td className="py-2.5 px-4 font-mono">{temp.language || 'en_US'}</td>
                              <td className="py-2.5 px-4">
                                <Badge className={getStatusBadgeVariant(temp.status)}>
                                  {temp.status}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <div className="flex justify-end items-center gap-1.5">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 text-[10px] px-2 text-primary font-semibold"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTemplateName(temp.name);
                                    }}
                                  >
                                    Preview
                                  </Button>
                                  {(temp.status === 'DRAFT' || temp.status === 'REJECTED') && (
                                    <Button 
                                      size="sm" 
                                      className="h-7 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const recipe = SHOPIFY_TEMPLATE_LIBRARY.find(t => t.template_name === temp.name);
                                        openEditor(temp.name, temp.body_text, recipe?.default_delay_minutes || 0);
                                      }}
                                    >
                                      Submit
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Right side: Mobile Mockup Preview (2/5 width) */}
              <div className="lg:col-span-2 lg:sticky lg:top-4 flex flex-col items-center space-y-4 w-full">
                {editingTemplateName && (
                  <Card className="border-border bg-card p-4 space-y-4 animate-in slide-in-from-top-1 duration-200 w-full max-w-[325px]">
                    <div className="flex justify-between items-center border-b border-border pb-2">
                      <h4 className="text-xs font-bold text-foreground">Configure Message Template</h4>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setEditingTemplateName(null)}>Cancel</Button>
                    </div>
                    <div className="space-y-1.5 text-left w-full">
                      <label className="text-[10px] font-bold text-muted-foreground">Template Body Content</label>
                      <Textarea
                        value={editedBodyText}
                        onChange={(e) => setEditedBodyText(e.target.value)}
                        rows={4}
                        className="border-border bg-card text-foreground text-xs leading-relaxed"
                      />
                    </div>
                    <div className="flex gap-2 justify-end w-full">
                      <Button
                        size="sm"
                        className="h-8 bg-green-600 hover:bg-green-500 text-xs text-white px-3 flex items-center gap-1 font-bold"
                        onClick={submitToMeta}
                        disabled={submittingMeta}
                      >
                        {submittingMeta ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                        Submit to Meta
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold text-white px-3"
                        onClick={() => saveTemplateAndDelay('', false)}
                      >
                        Save Draft
                      </Button>
                    </div>
                  </Card>
                )}
                <p className="text-xs font-semibold text-muted-foreground">Message Preview</p>
                <div className="w-[325px] bg-slate-900 rounded-[36px] p-3 border-[6px] border-slate-950 shadow-2xl relative">
                  {/* Speaker and Camera notch */}
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2 h-3.5 w-28 bg-slate-950 rounded-full flex justify-center items-center gap-1.5 z-20">
                    <div className="h-1 w-10 bg-slate-800 rounded-full" />
                    <div className="h-1.5 w-1.5 bg-slate-800 rounded-full" />
                  </div>

                  <div className="bg-slate-950 rounded-t-[26px] pt-7 pb-2 px-3 border-b border-slate-850 text-center text-[11px] font-bold text-slate-300">
                    {selectedTemplateName || 'Template Preview'}
                  </div>

                  {/* Device Screen Background */}
                  <div className="bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-contain h-[460px] rounded-b-[26px] p-3 flex flex-col justify-end space-y-4">
                    <div className="bg-slate-950/90 text-white rounded-lg p-3 max-w-[95%] shadow text-[11.5px] space-y-2 border border-slate-850 select-none animate-in zoom-in-95 duration-100">
                      
                      {selectedTemplateName.startsWith('wacrm_') ? (
                        <div className="w-full h-32 mb-1.5 rounded overflow-hidden relative border border-slate-850/60 bg-slate-900 flex items-center justify-center">
                          <Image src="/organic-jam.png" alt="Organic Jam Combo" fill className="object-cover" unoptimized />
                        </div>
                      ) : null}

                      {/* Simulated banner header for marketing template if name contains code or discount */}
                      {selectedTemplateName.includes('reminder') || selectedTemplateName.includes('cart') ? (
                        <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-3 rounded text-center font-extrabold text-[12px] text-white tracking-wide uppercase select-none">
                          ⚡ SPECIAL OFFER ⚡
                        </div>
                      ) : null}

                      <p className="leading-relaxed whitespace-pre-line text-slate-100 font-medium">
                        {getSelectedTemplatePreview()}
                      </p>

                      <div className="text-[7.5px] text-slate-500 text-right">
                        12:00 PM
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Confirm Msg & Cart Recovery */}
          {activeTab === 'confirm_msg' && (
            <div className="space-y-8">
              <div className="grid gap-6 lg:grid-cols-5 items-start">
                {/* Left Column: Confirmation Rules List */}
                <div className="lg:col-span-3 space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Transactional Message Drips</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Configure automated confirmation triggers and Cart Recovery sequence alerts.
                    </p>
                  </div>

                  {/* Card 1: COD Order Received */}
                  <Card className="bg-card border border-border">
                    <CardHeader className="pb-4 flex flex-row items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          📦 COD Order Received
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                          Fires when a COD order is placed. Includes Yes / No confirmation buttons.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">{codActive ? "Active" : "Inactive"}</span>
                        <Switch checked={codActive} onCheckedChange={setCodActive} className="data-[state=checked]:bg-primary" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0 text-xs">
                      <div className="flex items-center justify-between border-t border-border pt-4">
                        <span className="font-semibold text-muted-foreground">TEMPLATE</span>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-muted text-foreground border border-border font-mono text-[10px] px-2.5 py-1">
                            wacrm_cod_confirmation_v1
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] border-border text-foreground hover:bg-muted px-2.5"
                            onClick={() => openEditor('wacrm_cod_confirmation_v1', SHOPIFY_TEMPLATE_LIBRARY.find(t => t.template_name === 'wacrm_cod_confirmation_v1')?.body || '', 0)}
                          >
                            Change &rarr;
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="font-semibold text-muted-foreground block">SEND AFTER</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(['Instant', '5 min', '1 hr', '10 hr'] as const).map((d) => (
                            <button
                              key={d}
                              onClick={() => setCodDelay(d)}
                              className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-all ${
                                codDelay === d
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-1">
                        <label className="flex items-center gap-2 font-semibold text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={codResend}
                            onChange={(e) => setCodResend(e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary size-3.5"
                          />
                          <span>Resend if no reply</span>
                        </label>
                        {codResend && (
                          <div className="flex flex-wrap gap-1.5 ml-5 animate-in fade-in duration-200">
                            {(['1 hr', '5 hr', '10 hr'] as const).map((d) => (
                              <button
                                key={d}
                                onClick={() => setCodResendDelay(d)}
                                className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all ${
                                  codResendDelay === d
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 flex justify-end">
                        <Button size="sm" className="h-8 bg-primary hover:bg-primary/90 text-xs font-bold text-white px-4" onClick={() => saveAutometickRule('cod')}>
                          Save Changes
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 2: Prepaid Order Confirmed */}
                  <Card className="bg-card border border-border">
                    <CardHeader className="pb-4 flex flex-row items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          💳 Prepaid Order Confirmed
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                          Fires when payment is received for a prepaid order.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">{prepaidActive ? "Active" : "Inactive"}</span>
                        <Switch checked={prepaidActive} onCheckedChange={setPrepaidActive} className="data-[state=checked]:bg-primary" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0 text-xs">
                      <div className="flex items-center justify-between border-t border-border pt-4">
                        <span className="font-semibold text-muted-foreground">TEMPLATE</span>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-muted text-foreground border border-border font-mono text-[10px] px-2.5 py-1">
                            wacrm_order_confirmed_v1
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] border-border text-foreground hover:bg-muted px-2.5"
                            onClick={() => openEditor('wacrm_order_confirmed_v1', SHOPIFY_TEMPLATE_LIBRARY.find(t => t.template_name === 'wacrm_order_confirmed_v1')?.body || '', 0)}
                          >
                            Change &rarr;
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="font-semibold text-muted-foreground block">SEND AFTER</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(['Instant', '5 min', '1 hr', '10 hr'] as const).map((d) => (
                            <button
                              key={d}
                              onClick={() => setPrepaidDelay(d)}
                              className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-all ${
                                prepaidDelay === d
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <Button size="sm" className="h-8 bg-primary hover:bg-primary/90 text-xs font-bold text-white px-4" onClick={() => saveAutometickRule('prepaid')}>
                          Save Changes
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 3: Order Fulfilled / Shipped */}
                  <Card className="bg-card border border-border">
                    <CardHeader className="pb-4 flex flex-row items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          🚚 Order Shipped / Transit
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                          Fires when an order fulfillment update is marked on Shopify.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">{fulfilledActive ? "Active" : "Inactive"}</span>
                        <Switch checked={fulfilledActive} onCheckedChange={setFulfilledActive} className="data-[state=checked]:bg-primary" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0 text-xs">
                      <div className="flex items-center justify-between border-t border-border pt-4">
                        <span className="font-semibold text-muted-foreground">TEMPLATE</span>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-muted text-foreground border border-border font-mono text-[10px] px-2.5 py-1">
                            wacrm_order_shipped_v1
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] border-border text-foreground hover:bg-muted px-2.5"
                            onClick={() => openEditor('wacrm_order_shipped_v1', SHOPIFY_TEMPLATE_LIBRARY.find(t => t.template_name === 'wacrm_order_shipped_v1')?.body || '', 0)}
                          >
                            Change &rarr;
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="font-semibold text-muted-foreground block">SEND AFTER</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(['Instant', '5 min', '1 hr', '10 hr'] as const).map((d) => (
                            <button
                              key={d}
                              onClick={() => setFulfilledDelay(d)}
                              className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-all ${
                                fulfilledDelay === d
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <Button size="sm" className="h-8 bg-primary hover:bg-primary/90 text-xs font-bold text-white px-4" onClick={() => saveAutometickRule('fulfilled')}>
                          Save Changes
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Cart Recovery Sequence Section */}
                  <div className="space-y-6 pt-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-sm font-bold text-foreground">Cart Recovery drip sequence</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Multiple reminder steps sent sequentially to recover abandoned checkout processes.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border text-foreground hover:bg-muted text-xs font-bold flex items-center gap-1"
                        onClick={async () => {
                          try {
                            if (sequences.length === 0) return
                            const nextOrder = sequences[0].steps.length + 1
                            const { error } = await supabase
                              .from('shopify_automation_sequence_steps')
                              .insert({
                                sequence_id: sequences[0].id,
                                step_order: nextOrder,
                                delay_minutes_from_previous_step: nextOrder === 1 ? 30 : nextOrder === 2 ? 1440 : 2880,
                                template_name: nextOrder === 1 ? 'wacrm_cart_abandoned_v1' : nextOrder === 2 ? 'wacrm_cart_reminder_step2_v1' : 'wacrm_cart_reminder_step3_v1',
                                meta_approval_status: 'approved',
                                is_active: true
                              })
                            if (error) throw error
                            toast.success(`Successfully added Step ${nextOrder} to Cart Recovery drip sequence!`)
                            loadData()
                          } catch (err: unknown) {
                            const errMsg = err instanceof Error ? err.message : 'Unknown error'
                            toast.error('Failed to add step: ' + errMsg)
                          }
                        }}
                      >
                        <Plus className="size-3.5" /> Add Step
                      </Button>
                    </div>

                    {sequences.map((seq) => (
                      <div key={seq.id} className="space-y-4">
                        {seq.steps.map((step) => {
                          const originalRecipe = SHOPIFY_TEMPLATE_LIBRARY.find(t => t.template_name === step.template_name)
                          const metaStatus = customTemplates[step.template_name]?.status || step.meta_approval_status

                          const delays = step.step_order === 1
                            ? (['30 min', '1 hr', '2 hr', '10 hr'] as const)
                            : step.step_order === 2
                              ? (['12 hr', '24 hr', '36 hr', '48 hr'] as const)
                              : (['24 hr', '48 hr', '72 hr', '96 hr'] as const)

                          const selectedDelay = step.step_order === 1 ? step1Delay : step.step_order === 2 ? step2Delay : step3Delay
                          const handleSelectDelay = (val: string) => {
                            if (step.step_order === 1) {
                              setStep1Delay(val as "30 min" | "1 hr" | "2 hr" | "10 hr")
                            } else if (step.step_order === 2) {
                              setStep2Delay(val as "12 hr" | "24 hr" | "36 hr" | "48 hr")
                            } else {
                              setStep3Delay(val as "24 hr" | "48 hr" | "72 hr" | "96 hr")
                            }
                          }

                          return (
                            <Card key={step.id} className="bg-card border border-border">
                              <CardHeader className="pb-4 flex flex-row items-start justify-between">
                                <div className="space-y-1">
                                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    🔔 {seq.trigger_type === 'browse_abandoned'
                                      ? `Browse Abandoned Nudge (Step ${step.step_order})`
                                      : `Step ${step.step_order}: ${
                                          step.step_order === 1
                                            ? "Abandoned Cart Reminder"
                                            : step.step_order === 2
                                              ? "24h Follow-up Coupon"
                                              : "Final Discount Offer"
                                        }`}
                                  </CardTitle>
                                  <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                                    {seq.trigger_type === 'browse_abandoned'
                                      ? "Fires when a customer views a product page but does not add to cart."
                                      : step.step_order === 1
                                        ? "First recovery nudge sent quickly to recover the checkout."
                                        : step.step_order === 2
                                          ? "Follow-up reminder offering a support contact or warning on high-demand stock."
                                          : "Final cart recovery offer giving a custom 10% coupon to incentivize payment."}
                                  </CardDescription>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-medium text-muted-foreground">{step.is_active ? "Active" : "Inactive"}</span>
                                  <Switch 
                                    checked={step.is_active} 
                                    onCheckedChange={async (checked) => {
                                      try {
                                        const { error } = await supabase
                                          .from('shopify_automation_sequence_steps')
                                          .update({ is_active: checked })
                                          .eq('id', step.id)
                                        if (error) throw error
                                        toast.success(`Step ${step.step_order} ${checked ? 'activated' : 'deactivated'}`)
                                        loadData()
                                      } catch (err: unknown) {
                                        const errMsg = err instanceof Error ? err.message : 'Unknown error'
                                        toast.error(errMsg)
                                      }
                                    }}
                                    className="data-[state=checked]:bg-primary" 
                                  />
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-4 pt-0 text-xs">
                                <div className="flex items-center justify-between border-t border-border pt-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-muted-foreground">TEMPLATE</span>
                                    <Badge className={`${getStatusBadgeVariant(metaStatus)} text-[9px] py-px font-semibold uppercase`}>
                                      {metaStatus}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-muted text-foreground border border-border font-mono text-[10px] px-2.5 py-1">
                                      {step.template_name}
                                    </Badge>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-[10px] border-border text-foreground hover:bg-muted px-2.5"
                                      onClick={() => openEditor(step.template_name, originalRecipe?.body || '', step.delay_minutes_from_previous_step)}
                                    >
                                      Change &rarr;
                                    </Button>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <span className="font-semibold text-muted-foreground block">SEND AFTER</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {delays.map((d: string) => (
                                      <button
                                        key={d}
                                        onClick={() => {
                                          handleSelectDelay(d)
                                          const mins = d.includes('min') ? parseInt(d) : parseInt(d) * 60
                                          supabase
                                            .from('shopify_automation_sequence_steps')
                                            .update({ delay_minutes_from_previous_step: mins })
                                            .eq('id', step.id)
                                            .then(() => toast.success(`Step ${step.step_order} delay updated to ${d}`))
                                        }}
                                        className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-all ${
                                          selectedDelay === d
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                                        }`}
                                      >
                                        {d}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column: Visual WhatsApp Device Mockup */}
                <div className="lg:col-span-2 lg:sticky lg:top-4 space-y-4">
                  {editingTemplateName && (
                    <Card className="border-border bg-card p-4 space-y-4 animate-in slide-in-from-top-1 duration-200">
                      <div className="flex justify-between items-center border-b border-border pb-2">
                        <h4 className="text-xs font-bold text-foreground">Configure Message Template</h4>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setEditingTemplateName(null)}>Cancel</Button>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground">Template Body Content</label>
                        <Textarea
                          value={editedBodyText}
                          onChange={(e) => setEditedBodyText(e.target.value)}
                          rows={4}
                          className="border-border bg-card text-foreground text-xs leading-relaxed"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          className="h-8 bg-green-600 hover:bg-green-500 text-xs text-white px-3 flex items-center gap-1"
                          onClick={submitToMeta}
                          disabled={submittingMeta}
                        >
                          {submittingMeta ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                          Submit to Meta
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold text-white px-3"
                          onClick={() => saveTemplateAndDelay('', false)}
                        >
                          Save Draft
                        </Button>
                      </div>
                    </Card>
                  )}

                  <div className="flex justify-center w-full">
                    <div className="w-[325px] bg-slate-900 rounded-[36px] p-3 border-[6px] border-slate-950 shadow-2xl relative">
                      {/* Device Speaker Notch */}
                      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 h-3.5 w-28 bg-slate-950 rounded-full flex justify-center items-center gap-1.5 z-20">
                        <div className="h-1 w-10 bg-slate-800 rounded-full" />
                        <div className="h-1.5 w-1.5 bg-slate-800 rounded-full" />
                      </div>

                      {/* Preview screen sub-tabs for drips */}
                      <div className="bg-slate-950 rounded-t-[26px] pt-7 pb-2 px-2 border-b border-slate-850 flex justify-center gap-1 text-[9px] font-bold text-slate-400">
                        {(['COD', 'Prepaid', 'Cart', 'Step 1', 'Step 2', 'Step 3'] as const).map((tabVal) => {
                          const isActive = (['COD', 'Prepaid', 'Cart'].includes(tabVal) && phonePreviewTab === tabVal && !['Step 1', 'Step 2', 'Step 3'].includes(phonePreviewStep)) ||
                                           (['Step 1', 'Step 2', 'Step 3'].includes(tabVal) && phonePreviewStep === tabVal);
                          return (
                            <button
                              key={tabVal}
                              onClick={() => {
                                if (['Step 1', 'Step 2', 'Step 3'].includes(tabVal)) {
                                  setPhonePreviewStep(tabVal as 'Step 1' | 'Step 2' | 'Step 3');
                                  setPhonePreviewTab('Cart');
                                } else {
                                  setPhonePreviewTab(tabVal as 'COD' | 'Prepaid' | 'Cart');
                                  setPhonePreviewStep('Step 1');
                                }
                              }}
                              className={cn(
                                "px-1.5 py-0.5 rounded-full transition-all text-[8px] sm:text-[9px]",
                                isActive ? "bg-primary text-primary-foreground" : "bg-slate-900 border border-slate-850 hover:text-slate-200"
                              )}
                            >
                              {tabVal}
                            </button>
                          )
                        })}
                      </div>

                      {/* WhatsApp conversation simulator */}
                      <div className="bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-contain h-[460px] rounded-b-[26px] p-3 flex flex-col justify-end space-y-4">
                        <div className="bg-slate-950/90 text-white rounded-lg p-2.5 max-w-[92%] shadow text-[11.5px] space-y-2 border border-slate-850 select-none animate-in zoom-in-95 duration-100">
                          {((phonePreviewTab === 'Cart' && !['Step 1', 'Step 2', 'Step 3'].includes(phonePreviewStep)) || ['Step 1', 'Step 2', 'Step 3'].includes(phonePreviewStep)) && (
                            <div className="w-full h-32 mb-1.5 rounded overflow-hidden relative border border-slate-850/60 bg-slate-900 flex items-center justify-center">
                              <Image src="/organic-jam.png" alt="Organic Jam Combo" fill className="object-cover" unoptimized />
                            </div>
                          )}
                          <p className="leading-relaxed whitespace-pre-line text-slate-100 font-medium">
                            {['Step 1', 'Step 2', 'Step 3'].includes(phonePreviewStep) 
                              ? getSequenceStepPreviewText(phonePreviewStep === 'Step 1' ? 1 : phonePreviewStep === 'Step 2' ? 2 : 3)
                              : getSelectedPreviewText()}
                          </p>

                          {phonePreviewTab === 'COD' && (
                            <div className="border-t border-slate-850 pt-2 mt-2 flex flex-col gap-1.5 text-center font-bold text-[9px] text-[#53bdeb]">
                              <div className="bg-slate-900/60 py-1.5 rounded hover:bg-slate-900 cursor-pointer transition-all border border-slate-850">
                                ✓ Yes, confirm order ✅
                              </div>
                              <div className="bg-slate-900/60 py-1.5 rounded hover:bg-slate-900 cursor-pointer transition-all border border-slate-850 text-red-450">
                                ✗ Cancel Order
                              </div>
                            </div>
                          )}

                          {(phonePreviewTab === 'Cart' || phonePreviewStep === 'Step 1') && (
                            <div className="border-t border-slate-850 pt-2 mt-2 flex flex-col gap-1 text-center font-bold text-[9px] text-[#53bdeb] bg-slate-900/60 py-1.5 rounded border border-slate-850 hover:bg-slate-900 cursor-pointer">
                              🛒 Complete Checkout
                            </div>
                          )}

                          {phonePreviewStep === 'Step 3' && (
                            <div className="border-t border-slate-850 pt-2 mt-2 flex flex-col gap-1 text-center font-bold text-[9px] text-[#53bdeb] bg-slate-900/60 py-1.5 rounded border border-slate-850 hover:bg-slate-900 cursor-pointer">
                              🎁 Claim 10% Discount
                            </div>
                          )}

                          <div className="text-[8px] text-slate-500 text-right mt-1">
                            15:25
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Adv Features (Broadcast history, Scheduled trigger, Auto-reply settings, Flow Bot) */}
          {activeTab === 'adv_features' && (
            currentPlan === 'basic' ? (
              <Card className="border border-purple-500/20 bg-purple-500/[0.02] p-8 text-center max-w-xl mx-auto my-12 animate-in fade-in duration-200">
                <CardHeader className="space-y-2">
                  <div className="mx-auto size-12 rounded-full bg-purple-500/10 flex items-center justify-center mb-2">
                    <LockIcon className="size-6 text-purple-500 animate-bounce" />
                  </div>
                  <CardTitle className="text-lg font-bold text-foreground">Advanced Features Gated</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                    Broadcast campaigns, automation scheduling, auto status replies, and the visual flow bot are only available on the <strong>Growth</strong> or <strong>Scale</strong> plans.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[11px] text-muted-foreground">
                    Upgrade your subscription in the <strong>Billing</strong> tab to unlock these features for your Shopify store.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <Button
                      className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-6 h-9"
                      onClick={() => changePlan('growth')}
                    >
                      Upgrade to Growth
                    </Button>
                    <Button
                      variant="outline"
                      className="border-purple-500/20 text-purple-500 hover:bg-purple-500/10 font-bold text-xs px-6 h-9"
                      onClick={() => changePlan('scale')}
                    >
                      Upgrade to Scale
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
              {/* Secondary Navigation Pills */}
              <div className="flex gap-2 border-b border-border pb-3 text-xs">
                <button
                  onClick={() => setActiveSubTab('broadcast')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-all border",
                    activeSubTab === 'broadcast'
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  <Megaphone className="size-3.5" /> Broadcast
                </button>
                <button
                  onClick={() => setActiveSubTab('schedule')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-all border",
                    activeSubTab === 'schedule'
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  <Calendar className="size-3.5" /> Schedule
                </button>
                <button
                  onClick={() => setActiveSubTab('auto_reply')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-all border",
                    activeSubTab === 'auto_reply'
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  <Reply className="size-3.5" /> Auto Status Reply
                </button>
                <button
                  onClick={() => setActiveSubTab('flow_bot')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-all border",
                    activeSubTab === 'flow_bot'
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  <Bot className="size-3.5" /> Flow Bot
                </button>
              </div>

              {/* Sub-tab 1: Broadcast */}
              {activeSubTab === 'broadcast' && (
                <div className="grid gap-6 lg:grid-cols-5 items-start">
                  
                  {/* Left Column: Broadcast overview & table (3/5 width) */}
                  <div className="lg:col-span-3 space-y-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-base font-bold text-foreground">Broadcast Message</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Send a WhatsApp message to filtered customers using an approved template.
                        </p>
                      </div>
                      <Button 
                        size="sm" 
                        className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs font-bold text-white px-4 flex items-center gap-1"
                        onClick={() => window.location.href = '/broadcasts/new'}
                      >
                        <Plus className="size-3.5" /> Create Broadcast
                      </Button>
                    </div>

                    {/* Broadcast Overview Metrics */}
                    <Card className="bg-card">
                      <CardHeader className="pb-3 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Broadcast Overview</CardTitle>
                        <div className="flex gap-1 text-[9px] font-bold text-muted-foreground">
                          {(['month', 'last_month', '3_months', '12_months', 'all'] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => setBroadcastTimeline(t)}
                              className={cn(
                                "px-2 py-0.5 rounded transition-all capitalize",
                                broadcastTimeline === t ? "bg-primary text-primary-foreground font-extrabold" : "bg-muted hover:text-foreground"
                              )}
                            >
                              {t.replace('_', ' ')}
                            </button>
                          ))}
                        </div>
                      </CardHeader>
                      <CardContent className="grid grid-cols-3 gap-4 pt-1 text-center">
                        <div className="rounded-lg bg-muted/40 p-2.5 border border-border">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground">SENT</p>
                          <p className="text-xl font-extrabold text-foreground mt-1">{totalSentBroadcasts}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-2.5 border border-border">
                          <p className="text-[10px] uppercase font-bold text-green-500">DELIVERED</p>
                          <p className="text-xl font-extrabold text-green-500 mt-1">{totalDeliveredBroadcasts}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-2.5 border border-border">
                          <p className="text-[10px] uppercase font-bold text-destructive">FAILED</p>
                          <p className="text-xl font-extrabold text-destructive mt-1">{totalFailedBroadcasts}</p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Broadcast History Table */}
                    <Card className="bg-card">
                      <CardHeader className="pb-3 flex justify-between flex-row items-center">
                        <div>
                          <CardTitle className="text-sm font-bold">Broadcast History</CardTitle>
                          <CardDescription className="text-xs">Click any row to expand details in standard Broadcasts tab.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={loadData}>
                          <RefreshCw className="size-3 mr-1" /> Refresh
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                        {broadcastsList.length === 0 ? (
                          <div className="text-center py-10 text-xs text-muted-foreground">No broadcast logs created yet.</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-y border-border bg-muted/30 text-muted-foreground font-semibold">
                                  <th className="py-2 px-4">Broadcast Name</th>
                                  <th className="py-2 px-4">Template</th>
                                  <th className="py-2 px-4">Status</th>
                                  <th className="py-2 px-4 text-right">Recipients</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {broadcastsList.map((b) => (
                                  <tr 
                                    key={b.id} 
                                    className="hover:bg-muted/10 text-foreground cursor-pointer"
                                    onClick={() => window.location.href = `/broadcasts/${b.id}`}
                                  >
                                    <td className="py-2.5 px-4 font-semibold">{b.name}</td>
                                    <td className="py-2.5 px-4 font-mono text-[10px] text-muted-foreground">{b.template_name}</td>
                                    <td className="py-2.5 px-4">
                                      <Badge className={cn(
                                        "text-[8px] font-semibold py-0 px-1 border-none",
                                        (b.status as string) === 'completed' || b.status === 'sent' ? "bg-green-500/10 text-green-500" :
                                        b.status === 'sending' ? "bg-amber-500/10 text-amber-500 animate-pulse" : "bg-muted text-muted-foreground"
                                      )}>
                                        {b.status}
                                      </Badge>
                                    </td>
                                    <td className="py-2.5 px-4 text-right font-semibold">{b.delivered_count} sent of {b.total_recipients}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Right Column: Visual smartphone preview (2/5 width) */}
                  <div className="lg:col-span-2 lg:sticky lg:top-4 flex flex-col items-center space-y-4">
                    <p className="text-xs font-semibold text-muted-foreground">MESSAGE PREVIEW</p>
                    <div className="w-[325px] bg-slate-900 rounded-[36px] p-3 border-[6px] border-slate-950 shadow-2xl relative">
                      {/* Notch */}
                      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 h-3.5 w-28 bg-slate-950 rounded-full flex justify-center items-center gap-1.5 z-20">
                        <div className="h-1 w-10 bg-slate-800 rounded-full" />
                        <div className="h-1.5 w-1.5 bg-slate-800 rounded-full" />
                      </div>

                      <div className="bg-slate-950 rounded-t-[26px] pt-7 pb-2 px-3 border-b border-slate-850 flex justify-between items-center text-[10px] font-bold text-slate-400">
                        <span className="truncate max-w-[150px]">Yoobbel India</span>
                        <span className="text-[8px] font-normal text-slate-500">Business Account</span>
                      </div>

                      {/* Simulated WhatsApp screen */}
                      <div className="bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-contain h-[460px] rounded-b-[26px] p-3 flex flex-col justify-end space-y-4">
                        <div className="bg-slate-950/90 text-white rounded-lg p-2.5 max-w-[92%] shadow text-[11.5px] space-y-2 border border-slate-850 select-none animate-in zoom-in-95 duration-100">
                          <div className="w-full h-32 mb-1.5 rounded overflow-hidden relative border border-slate-850/60 bg-slate-900 flex items-center justify-center">
                            <Image src="/organic-jam.png" alt="Organic Jam Combo" fill className="object-cover" unoptimized />
                          </div>
                          
                          <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-3 rounded text-center font-extrabold text-[12px] text-white tracking-wide uppercase">
                            ⚡ Special Offer ⚡
                          </div>

                          <p className="leading-relaxed whitespace-pre-line text-slate-100 font-medium">
                            {"Hey Rahul! Exclusive offer just for you!\n\nUse code SAVE20 to get 20% off your next purchase. Limited time only — grab it before it stores!"}
                          </p>

                          <div className="border-t border-slate-850 pt-2 mt-2 text-center font-bold text-[9px] text-[#53bdeb] bg-slate-900/60 py-1.5 rounded border border-slate-850 hover:bg-slate-900 cursor-pointer">
                            Claim 20% Discount
                          </div>

                          <div className="text-[7.5px] text-slate-500 text-right mt-1">
                            09:41
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-tab 2: Schedule */}
              {activeSubTab === 'schedule' && (
                <Card>
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">Scheduled Drip Rules</CardTitle>
                      <CardDescription>Manage and schedule promotional broadcasts and newsletters.</CardDescription>
                    </div>
                    <Button 
                      size="sm" 
                      className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs font-bold text-white px-3 flex items-center gap-1"
                      onClick={() => window.location.href = '/broadcasts/new'}
                    >
                      <Plus className="size-3.5" /> Create
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs text-muted-foreground">
                    <div className="border border-border rounded-lg p-4 bg-muted/20 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">Holiday Season Coupon Blast</p>
                        <p className="text-[11px]">Segment: <strong>Active Buyers</strong> &bull; Scheduled: <strong>24 Dec 2026, 10:00 AM</strong></p>
                      </div>
                      <Badge className="bg-primary/10 text-primary border-none self-start sm:self-center">Pending</Badge>
                    </div>

                    <div className="border border-border rounded-lg p-4 bg-muted/20 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">Weekend Re-engagement Nudge</p>
                        <p className="text-[11px]">Segment: <strong>Inactive (30 Days)</strong> &bull; Scheduled: <strong>Every Saturday, 4:00 PM</strong></p>
                      </div>
                      <Badge className="bg-green-500/10 text-green-500 border-none self-start sm:self-center">Active Drip</Badge>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs font-bold text-white px-4" onClick={() => window.location.href = '/broadcasts/new'}>
                        Schedule New Campaign
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sub-tab 3: Auto Status Reply */}
              {activeSubTab === 'auto_reply' && (
                <Card>
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">Auto Status Reply Rules</CardTitle>
                      <CardDescription>Reply automatically to user trigger keywords (e.g. tracking orders).</CardDescription>
                    </div>
                    <Button 
                      size="sm" 
                      className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs font-bold text-white px-3 flex items-center gap-1"
                      onClick={() => toast.success("Added new keyword trigger template!")}
                    >
                      <Plus className="size-3.5" /> Create
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="font-semibold text-muted-foreground">Trigger Keyword / Phrase</label>
                        <Input 
                          value={autoReplyKeyword} 
                          onChange={(e) => setAutoReplyKeyword(e.target.value)}
                          className="border-border text-foreground bg-card h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="font-semibold text-muted-foreground">Response Template</label>
                        <Textarea 
                          value={autoReplyText} 
                          onChange={(e) => setAutoReplyText(e.target.value)}
                          rows={3}
                          className="border-border text-foreground bg-card leading-relaxed"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs font-bold text-white px-4" onClick={() => toast.success('Auto status replies saved successfully!')}>
                        Save Trigger Rule
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sub-tab 4: Flow Bot */}
              {activeSubTab === 'flow_bot' && (
                <Card>
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">Visual Flow Bot Automation</CardTitle>
                      <CardDescription>Direct conversations and build recovery triggers on a visual canvas.</CardDescription>
                    </div>
                    <Button 
                      size="sm" 
                      className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs font-bold text-white px-3 flex items-center gap-1"
                      onClick={() => window.location.href = '/flows'}
                    >
                      <Plus className="size-3.5" /> Create
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs text-muted-foreground">
                    <p className="leading-relaxed">
                      WACRM includes a full-featured visual flow builder. Create customizable chatbots that reply to customers based on keyword matches, variables, or status tags.
                    </p>
                    <div className="border border-border rounded-lg p-4 bg-muted/20 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-foreground">Shopify Helpdesk Flow</p>
                        <p className="text-[11px]">Handles: Welcome, Order Tracking, and Agent Handover</p>
                      </div>
                      <Badge className="bg-green-500/10 text-green-500 border-none">Activated</Badge>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="outline" className="border-border h-8 text-xs" onClick={() => window.location.href = '/flows'}>
                        Open Flow Builder
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )
        )}

          {/* Tab 5: Settings & Webhook Logs */}
          {activeTab === 'settings' && (
            <div className="grid gap-6 lg:grid-cols-5 items-start animate-in fade-in duration-250">
              {/* Left Column: Settings and Agent Forms (3/5 width) */}
              <div className="lg:col-span-3 space-y-6">
                
                {/* Store Credentials */}
                <Card>
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
                        className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs font-bold text-white px-3"
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

                {/* Create New Agent Form */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Create New Agent</CardTitle>
                    <CardDescription>Add agents to handle support and sales chat conversations.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3.5">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Full name</label>
                        <Input
                          placeholder="Full name"
                          value={agentName}
                          onChange={(e) => setAgentName(e.target.value)}
                          className="border-border bg-card text-foreground text-xs h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email address</label>
                        <Input
                          type="email"
                          placeholder="Email address"
                          value={agentEmail}
                          onChange={(e) => setAgentEmail(e.target.value)}
                          className="border-border bg-card text-foreground text-xs h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Password (min 6 chars)</label>
                        <Input
                          type="password"
                          placeholder="Password"
                          value={agentPassword}
                          onChange={(e) => setAgentPassword(e.target.value)}
                          className="border-border bg-card text-foreground text-xs h-9"
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 mt-2"
                      onClick={handleCreateAgent}
                      disabled={creatingAgent}
                    >
                      {creatingAgent ? <Loader2 className="size-3.5 animate-spin mr-2" /> : null}
                      + Create User
                    </Button>
                  </CardContent>
                </Card>

                {/* Mobile Agent Login URL */}
                <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Mobile Agent Login URL</CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground mt-0.5">Share this link with agents to log in on mobile devices.</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value="https://whatsapp.arhamtechnology.com/shopify/login"
                        className="font-mono text-xs border-border bg-card text-foreground select-all h-9 flex-1"
                      />
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 px-4"
                        onClick={() => {
                          navigator.clipboard.writeText('https://whatsapp.arhamtechnology.com/shopify/login')
                          toast.success('Mobile Agent Login URL copied to clipboard!')
                        }}
                      >
                        Copy Link
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Agents List */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Agents</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {agentsList.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">No agents added yet.</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {agentsList.map((agent) => (
                          <div key={agent.id} className="p-3 flex justify-between items-center hover:bg-muted/20">
                            <div className="flex items-center gap-3">
                              <div className="size-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs">
                                {agent.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-foreground text-xs">{agent.name}</p>
                                <p className="text-[10px] text-muted-foreground">{agent.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                                onClick={() => {
                                  setAgentName(agent.name)
                                  setAgentEmail(agent.email)
                                  toast.info('Agent details populated in form for editing.')
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteAgent(agent.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Webhook Activity Feed */}
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

              {/* Right Column: Visual smartphone preview (2/5 width) */}
              <div className="lg:col-span-2 lg:sticky lg:top-4 flex flex-col items-center space-y-4">
                <p className="text-xs font-semibold text-muted-foreground">MESSAGE PREVIEW</p>
                <div className="w-[325px] bg-slate-900 rounded-[36px] p-3 border-[6px] border-slate-950 shadow-2xl relative">
                  {/* Notch */}
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2 h-3.5 w-28 bg-slate-950 rounded-full flex justify-center items-center gap-1.5 z-20">
                    <div className="h-1 w-10 bg-slate-800 rounded-full" />
                    <div className="h-1.5 w-1.5 bg-slate-800 rounded-full" />
                  </div>

                  <div className="bg-slate-950 rounded-t-[26px] pt-7 pb-2 px-3 border-b border-slate-850 flex justify-between items-center text-[10px] font-bold text-slate-400">
                    <span className="truncate max-w-[150px]">{shopName || 'Yoobbel India'}</span>
                    <span className="text-[8px] font-normal text-slate-500">Business Account</span>
                  </div>

                  {/* Simulated WhatsApp screen */}
                  <div className="bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-contain h-[460px] rounded-b-[26px] p-3 flex flex-col justify-end space-y-4">
                    <div className="bg-slate-950/90 text-white rounded-lg p-2.5 max-w-[92%] shadow text-[11.5px] space-y-2 border border-slate-850 select-none animate-in zoom-in-95 duration-100">
                      <div className="w-full h-32 mb-1.5 rounded overflow-hidden relative border border-slate-850/60 bg-slate-900 flex items-center justify-center">
                        <Image src="/organic-jam.png" alt="Organic Jam Combo" fill className="object-cover" unoptimized />
                      </div>
                      
                      <div className="bg-gradient-to-r from-emerald-600 to-green-600 p-3 rounded text-center font-extrabold text-[12px] text-white tracking-wide uppercase">
                        ⚡ Order Confirmed ⚡
                      </div>

                      <p className="leading-relaxed whitespace-pre-line text-slate-100 font-medium">
                        {`Hi Rahul! Your COD order #1693 for ₹1,299 from Yoobbel India is confirmed.\n\nPlease click below to verify your delivery address.`}
                      </p>

                      <div className="border-t border-slate-850 pt-2 mt-2 flex flex-col gap-1.5 text-center font-bold text-[9px] text-[#53bdeb]">
                        <div className="bg-slate-900/60 py-1.5 rounded hover:bg-slate-900 cursor-pointer transition-all border border-slate-850">
                          Yes, confirm order ✅
                        </div>
                        <div className="bg-slate-900/60 py-1.5 rounded hover:bg-slate-900 cursor-pointer transition-all border border-slate-850 text-red-450">
                          No, cancel order
                        </div>
                      </div>

                      <div className="text-[7.5px] text-slate-500 text-right mt-1">
                        09:41
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Tab 6: Shopify Billing Plans */}
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
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> CRM Pipelines</li>
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
                      <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> CRM Pipelines</li>
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
        </div>
      )}

      {/* Tab 7: Chats (Live CRM Inbox embedded) */}
      {activeTab === 'chats' && (
        <div className="flex-1 overflow-hidden h-[calc(100vh-6.5rem)] relative animate-in fade-in duration-300">
          <InboxPage />
        </div>
      )}

      {/* Tab 8: Pipelines (Live CRM Pipelines embedded) */}
      {activeTab === 'pipelines' && currentPlan !== 'basic' && (
        <div className="flex-1 overflow-hidden h-[calc(100vh-6.5rem)] relative animate-in fade-in duration-300">
          <PipelinesPage />
        </div>
      )}
    </div>
  )
}
