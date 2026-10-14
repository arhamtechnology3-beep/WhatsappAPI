import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  isSkippedMetaCatalogTemplate,
  shouldImportNewMetaTemplate,
} from '@/lib/whatsapp/template-sync-policy'
import { propagateTemplateApproval } from '@/lib/shopify/automation-bindings'
import { metaTemplateToRow, type MetaTemplate } from '@/lib/whatsapp/meta-template-row'

/**
 * Sync message templates from Meta → local message_templates table.
 *
 * The local catalog stores Meta's status enum verbatim (APPROVED /
 * PENDING / REJECTED / PAUSED / DISABLED / IN_APPEAL / PENDING_DELETION)
 * so the edit / resubmit / delete flows can distinguish recoverable
 * states (PAUSED) from terminal ones (DISABLED) and so webhook events
 * land 1:1 without a translation table.
 *
 * Locally-created templates (no Meta counterpart) are NOT deleted —
 * they remain visible so the user can notice drift and clean up.
 *
 * Templates that are not already in wacrm are NOT inserted. Syncing
 * used to re-import the full WABA catalog (including deleted Shopify
 * recipes) every time someone clicked the button.
 */

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export async function POST() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve the caller's account_id — both whatsapp_config and
    // the message_templates we sync into are account-scoped.
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
        },
        { status: 400 },
      )
    }

    if (!config.waba_id) {
      return NextResponse.json(
        {
          error:
            'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
        },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)

    // Clean up any existing irrelevant templates in our DB
    await supabase
      .from('message_templates')
      .delete()
      .eq('account_id', accountId)
      .or('name.ilike.jaspers_%,name.ilike.sample_%,name.eq.hello_world')


    const metaTemplates: MetaTemplate[] = []
    let nextUrl:
      | string
      | null = `${META_API_BASE}/${config.waba_id}/message_templates?limit=100&fields=id,name,language,status,category,components,quality_score`
    const PAGE_CAP = 20
    let pageCount = 0

    while (nextUrl && pageCount < PAGE_CAP) {
      pageCount++
      const metaRes: Response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!metaRes.ok) {
        let metaErr = `Meta API error: ${metaRes.status}`
        try {
          const body = await metaRes.json()
          if (body?.error?.message) metaErr = body.error.message
        } catch {
          // response wasn't JSON — keep the fallback
        }
        return NextResponse.json({ error: metaErr }, { status: 502 })
      }

      const metaBody: {
        data?: MetaTemplate[]
        paging?: { next?: string }
      } = await metaRes.json()
      if (metaBody.data) metaTemplates.push(...metaBody.data)
      nextUrl = metaBody.paging?.next ?? null
    }

    let inserted = 0
    let updated = 0
    let skipped = 0
    const errors: { name: string; language: string; message: string }[] = []

    for (const t of metaTemplates) {
      if (isSkippedMetaCatalogTemplate(t.name)) {
        skipped++
        continue
      }

      const { data: existing, error: lookupErr } = await supabase
        .from('message_templates')
        .select('id, header_media_url')
        .eq('account_id', accountId)
        .eq('name', t.name)
        .eq('language', t.language)
        .maybeSingle()

      if (lookupErr) {
        errors.push({
          name: t.name,
          language: t.language,
          message: lookupErr.message,
        })
        continue
      }

      // account_id is NOT NULL on message_templates post-017.
      const row = metaTemplateToRow(t, {
        accountId,
        userId: user.id,
        existingHeaderMediaUrl: existing?.header_media_url,
      })

      if (existing?.id) {
        const { error: updErr } = await supabase
          .from('message_templates')
          .update({
            ...row,
            // Meta sync does not return a public header URL. Keep whatever
            // we already stored so image-header sends keep working.
            header_media_url:
              (existing as { header_media_url?: string | null }).header_media_url ??
              null,
          })
          .eq('id', existing.id)
        if (updErr) {
          errors.push({
            name: t.name,
            language: t.language,
            message: updErr.message,
          })
        } else {
          updated++
          await propagateTemplateApproval(supabase, accountId, t.name, row.status)
        }
      } else if (shouldImportNewMetaTemplate()) {
        const { error: insErr } = await supabase
          .from('message_templates')
          .insert(row)
        if (insErr) {
          errors.push({
            name: t.name,
            language: t.language,
            message: insErr.message,
          })
        } else {
          inserted++
          await propagateTemplateApproval(supabase, accountId, t.name, row.status)
        }
      } else {
        skipped++
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      total: metaTemplates.length,
      inserted,
      updated,
      skipped,
      errors,
      truncated: pageCount >= PAGE_CAP && nextUrl !== null,
    })
  } catch (error) {
    console.error('Error syncing WhatsApp templates:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to sync templates',
      },
      { status: 500 },
    )
  }
}
