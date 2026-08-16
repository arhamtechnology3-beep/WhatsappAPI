import { sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import { supabaseAdmin } from './admin-client'
import {
  buildRecipeButtonParams,
  buildTemplateCustomerView,
  defaultHeaderImageUrl,
  recipeByName,
  resolveHeaderMediaUrl,
} from '@/lib/shopify/whatsapp-template-library'

// ------------------------------------------------------------
// Automation-side Meta sender.
//
// Mirrors the logic in src/app/api/whatsapp/send/route.ts but uses
// the service-role client (engine has no cookies) and accepts the
// user / conversation / contact identifiers the engine already has
// on hand. Kept here (rather than refactoring the user-facing send
// route) to avoid risk to the working manual-send path — they can
// converge in a later refactor.
// ------------------------------------------------------------

interface SendTextArgs {
  /** Account-level tenancy key. Drives contact + whatsapp_config
   *  lookups so an automation authored by user A still sends through
   *  the WhatsApp number user B saved on the same account. */
  accountId: string
  /** Original author of the automation/flow — used for INSERT audit
   *  columns (messages.sender_id-ish) and for resolving the agent's
   *  identity in logs. Not consulted for tenancy. */
  userId: string
  conversationId: string
  contactId: string
  text: string
}

interface SendTemplateArgs {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  templateName: string
  language?: string
  params?: string[]
  buttonUrls?: {
    checkout_url?: string
    product_url?: string
    tracking_url?: string
  }
}

export async function engineSendText(args: SendTextArgs): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'text' })
}

export async function engineSendTemplate(
  args: SendTemplateArgs,
): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'template' })
}

type SendInput =
  | (SendTextArgs & { kind: 'text' })
  | (SendTemplateArgs & { kind: 'template' })

function getProductImageUrlFromLineItems(lineItems: any): string | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null
  const firstItem = lineItems[0]
  if (!firstItem) return null
  const url =
    firstItem.image_url ||
    firstItem.image ||
    firstItem.featured_image?.url ||
    firstItem.variant?.image?.src ||
    null
  return url
}

async function sendViaMeta(input: SendInput): Promise<{ whatsapp_message_id: string }> {
  const db = supabaseAdmin()

  // Scope the contact + config lookups by account_id, not user_id.
  // The engine uses the service-role client (bypassing RLS); without
  // this filter, an authenticated user could fire their own
  // automations against another tenant's contact UUID and send via
  // their own WhatsApp config to that contact's phone. The 017
  // migration moved both tables to account-scoped tenancy, so the
  // check is the same defense-in-depth as before, just keyed on the
  // new tenancy column.
  const { data: contact, error: contactErr } = await db
    .from('contacts')
    .select('id, phone')
    .eq('id', input.contactId)
    .eq('account_id', input.accountId)
    .maybeSingle()
  if (contactErr || !contact) {
    throw new Error('contact not found for this account')
  }
  if (!contact.phone?.trim()) {
    throw new Error('contact has no phone number')
  }

  const sanitized = sanitizePhoneForMeta(contact.phone)
  if (!isValidE164(sanitized)) {
    throw new Error(`contact phone invalid: ${contact.phone}`)
  }

  const { data: config, error: configErr } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', input.accountId)
    .single()
  if (configErr || !config) {
    throw new Error('WhatsApp not configured for this account')
  }

  const accessToken = decrypt(config.access_token)

  const attempt = async (phone: string): Promise<string> => {
    if (input.kind === 'template') {
      const requestedLang = input.language || 'en_US'
      let { data: templateRow } = await db
        .from('message_templates')
        .select('*')
        .eq('account_id', input.accountId)
        .eq('name', input.templateName)
        .eq('language', requestedLang)
        .maybeSingle()

      if (!templateRow) {
        const { data: fallbackRow } = await db
          .from('message_templates')
          .select('*')
          .eq('account_id', input.accountId)
          .eq('name', input.templateName)
          .maybeSingle()
        if (fallbackRow) {
          templateRow = fallbackRow
        }
      }
      ;(input as any)._templateRow = templateRow

      if (templateRow?.category === 'MARKETING') {
        const { canSendMarketing } = await import('@/lib/whatsapp/opt-in-helper')
        const allowed = await canSendMarketing(input.contactId)
        if (!allowed) {
          throw new Error('skipped_no_consent')
        }
      }

      const messageParams: any = {
        body: input.params,
      }

      if (/^wacrm_cod_confirmation/.test(input.templateName)) {
        messageParams.buttonParams = {
          0: 'confirm_cod',
          1: 'cancel_cod',
        }
      } else {
        const recipe = recipeByName(input.templateName)
        if (recipe) {
          const { data: checkout } = await db
            .from('shopify_checkouts')
            .select('abandoned_checkout_url, line_items')
            .eq('contact_id', input.contactId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const { data: order } = await db
            .from('shopify_orders')
            .select('tracking_url, line_items')
            .eq('contact_id', input.contactId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          messageParams.buttonParams = buildRecipeButtonParams(recipe, {
            checkout_url:
              input.buttonUrls?.checkout_url ||
              checkout?.abandoned_checkout_url ||
              undefined,
            product_url: input.buttonUrls?.product_url,
            tracking_url:
              input.buttonUrls?.tracking_url ||
              order?.tracking_url ||
              undefined,
          })
        }
      }

      // If the template has an image header, resolve the product image URL dynamically
      if (templateRow?.header_type === 'image') {
        let resolvedImageUrl: string | null = null

        // 1. Try checkout line items
        const { data: checkout } = await db
          .from('shopify_checkouts')
          .select('line_items')
          .eq('contact_id', input.contactId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (checkout?.line_items) {
          resolvedImageUrl = getProductImageUrlFromLineItems(checkout.line_items)
        }

        // 2. Try order line items
        if (!resolvedImageUrl) {
          const { data: order } = await db
            .from('shopify_orders')
            .select('line_items')
            .eq('contact_id', input.contactId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (order?.line_items) {
            resolvedImageUrl = getProductImageUrlFromLineItems(order.line_items)
          }
        }

        messageParams.headerMediaUrl = resolveHeaderMediaUrl(
          templateRow,
          resolvedImageUrl,
        )
      }

      ;(input as any)._messageParams = messageParams

      const r = await sendTemplateMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        templateName: input.templateName,
        language: templateRow?.language || input.language || 'en_US',
        params: input.params,
        template: templateRow || undefined,
        messageParams,
      })
      return r.messageId
    }
    const r = await sendTextMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: phone,
      text: input.text,
    })
    return r.messageId
  }

  // Same phone-variant retry as /api/whatsapp/send — Meta sandbox and
  // numbers registered with/without a trunk 0 both require this to
  // reliably land a message.
  const variants = phoneVariants(sanitized)
  let workingPhone = sanitized
  let waMessageId = ''
  let lastError: unknown = null
  for (const v of variants) {
    try {
      waMessageId = await attempt(v)
      workingPhone = v
      lastError = null
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // #131030 = "recipient not in allowed list" (Meta sandbox restriction).
      // ALL format variants of the same number will fail identically — stop
      // retrying immediately and surface the error once, not 4 times.
      if (isRecipientNotAllowedError(msg)) {
        console.warn(
          `[meta-send] #131030 sandbox restriction — phone ${v} is not in Meta's test recipient list. ` +
          `Add it at: https://developers.facebook.com/apps → WhatsApp → API Setup → Test numbers.`
        )
        lastError = err
        break // bail — other variants will fail identically
      }
      throw err // any other error (bad token, template error, etc.) bubbles up immediately
    }
  }
  if (lastError) throw lastError

  if (workingPhone !== sanitized) {
    await db.from('contacts').update({ phone: workingPhone }).eq('id', contact.id)
  }

  // Persist the sent message so it appears in the inbox with a real
  // Meta message id. sender_type='bot' distinguishes automation sends
  // from manual agent sends.
  const content_type = input.kind === 'template' ? 'template' : 'text'
  const template_name = input.kind === 'template' ? input.templateName : null

  let content_text = input.kind === 'text' ? input.text : null
  if (input.kind === 'template') {
    // Render interpolated body text so the inbox bubble and list preview display full message content
    const templateBody = (input as any)._templateRow?.body_text || `Template: ${input.templateName}`
    const paramsList = input.params || []
    content_text = templateBody.replace(/\{\{(\d+)\}\}/g, (_: string, raw: string) => {
      const idx = Number(raw) - 1
      return paramsList[idx] ?? `{{${raw}}}`
    })
  }

  const templateRow = (input as any)._templateRow
  const messageParams = (input as any)._messageParams || {}

  const { error: msgErr } = await db.from('messages').insert({
    conversation_id: input.conversationId,
    sender_type: 'bot',
    content_type,
    content_text,
    media_url:
      input.kind === 'template'
        ? messageParams.headerMediaUrl ||
          (templateRow?.header_type === 'image' ? defaultHeaderImageUrl() : null)
        : null,
    template_name,
    template_payload:
      input.kind === 'template' && templateRow
        ? buildTemplateCustomerView(templateRow, messageParams)
        : null,
    message_id: waMessageId,
    status: 'sent',
  })
  if (msgErr) {
    // Meta already has the message; record the DB error but don't pretend
    // the send failed. The engine wraps this in a log line.
    throw new Error(`sent to Meta but DB insert failed: ${msgErr.message}`)
  }

  await db
    .from('conversations')
    .update({
      last_message_text: content_text || (input.kind === 'template' ? `Template: ${input.templateName}` : input.text),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.conversationId)

  return { whatsapp_message_id: waMessageId }
}
