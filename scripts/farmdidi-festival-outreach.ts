/**
 * Farmdidi competitor-follower outreach (ops one-shot).
 *
 * 1) Build a phone+name+email CSV tagged `farmdidi` from farmdidi.xlsx
 *    (or the Meta-format audience CSV).
 * 2) Upsert contacts, mark marketing opt-in, attach the farmdidi tag.
 * 3) Send approved `wacrm_festival_broadcast_v2` (Namaste {{1}}).
 * 4) Enroll each contact on welcome-drip step 2 (`wacrm_shop_now_followup_v1`)
 *    so shop-now only goes out if they do not order.
 *
 * Usage:
 *   npx tsx scripts/farmdidi-festival-outreach.ts \
 *     --source /path/to/farmdidi.xlsx \
 *     [--account-id <uuid>] \
 *     [--dry-run] \
 *     [--skip-send] \
 *     [--csv-out /tmp/farmdidi_whatsapp_import.csv]
 *
 * Requires .env.local (or process env):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY
 */
import { createReadStream, existsSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { basename, extname } from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.local' })

const TAG_NAME = 'farmdidi'
const TEMPLATE_NAME = 'wacrm_festival_broadcast_v2'
const WELCOME_TRIGGER = 'shopify_customer_created'
const FOLLOWUP_DELAY_MINUTES = 300
const TAG_COLOR = '#16a34a'

type AudienceRow = {
  phone: string
  name: string
  email: string
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  if (i === -1) return undefined
  return process.argv[i + 1]
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function isRealFirstName(value: string | undefined): boolean {
  if (!value) return false
  const v = value.trim()
  if (!v) return false
  if (v.length === 1) return false
  if (/^unknown$/i.test(v)) return false
  return true
}

async function loadAudience(sourcePath: string): Promise<AudienceRow[]> {
  const ext = extname(sourcePath).toLowerCase()
  if (ext === '.xlsx' || ext === '.xls') {
    return loadFromXlsx(sourcePath)
  }
  return loadFromCsv(sourcePath)
}

async function loadFromXlsx(sourcePath: string): Promise<AudienceRow[]> {
  // Lazy require so the script still typechecks when xlsx is not installed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const workbook = XLSX.readFile(sourcePath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  })
  const out: AudienceRow[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const phoneRaw = String(
      row.phone_number ?? row.phone ?? row.Phone ?? '',
    ).trim()
    if (!phoneRaw) continue
    const { toMetaPhone } = await import('../src/lib/whatsapp/phone-utils')
    const phone = toMetaPhone(phoneRaw)
    if (!phone || seen.has(phone)) continue
    seen.add(phone)
    const first = String(row.first_name ?? row.fn ?? '').trim()
    const username = String(row.username ?? '').trim()
    const name = isRealFirstName(first) ? first : username || first || phone
    const email = String(row.email ?? '').trim()
    out.push({ phone, name, email })
  }
  return out
}

async function loadFromCsv(sourcePath: string): Promise<AudienceRow[]> {
  const { toMetaPhone } = await import('../src/lib/whatsapp/phone-utils')
  const lines: string[] = []
  const rl = createInterface({ input: createReadStream(sourcePath) })
  for await (const line of rl) lines.push(line)
  if (lines.length < 2) return []

  const header = splitCsvLine(lines[0]).map((h) =>
    h.replace(/^\ufeff/, '').trim().toLowerCase(),
  )
  const phoneIdx = header.findIndex((h) => h === 'phone' || h === 'phone_number')
  if (phoneIdx === -1) {
    throw new Error('CSV needs a phone or phone_number column')
  }
  const nameIdx = header.findIndex((h) => h === 'name' || h === 'first_name' || h === 'fn')
  const usernameIdx = header.findIndex((h) => h === 'username')
  const emailIdx = header.findIndex((h) => h === 'email')

  const out: AudienceRow[] = []
  const seen = new Set<string>()
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    const phoneRaw = (cols[phoneIdx] || '').trim()
    if (!phoneRaw) continue
    const phone = toMetaPhone(phoneRaw)
    if (!phone || seen.has(phone)) continue
    seen.add(phone)
    const first = nameIdx >= 0 ? (cols[nameIdx] || '').trim() : ''
    const username = usernameIdx >= 0 ? (cols[usernameIdx] || '').trim() : ''
    const name = isRealFirstName(first) ? first : username || first || phone
    const email = emailIdx >= 0 ? (cols[emailIdx] || '').trim() : ''
    out.push({ phone, name, email })
  }
  return out
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      result.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  result.push(cur)
  return result
}

function writeImportCsv(rows: AudienceRow[], outPath: string): void {
  const body = [
    'phone,name,email,tags',
    ...rows.map(
      (r) =>
        `${csvEscape(r.phone)},${csvEscape(r.name)},${csvEscape(r.email)},${TAG_NAME}`,
    ),
  ].join('\n')
  writeFileSync(outPath, body, 'utf8')
  console.log(`Wrote ${rows.length} rows → ${outPath}`)
}

async function main() {
  const source =
    argValue('--source') ||
    process.env.FARMIDI_SOURCE ||
    process.env.FARMDIDI_SOURCE
  if (!source || !existsSync(source)) {
    throw new Error(
      'Pass --source /path/to/farmdidi.xlsx (or farmdidi_audience_formatted.csv). File not found.',
    )
  }

  const dryRun = hasFlag('--dry-run')
  const skipSend = hasFlag('--skip-send')
  const csvOut =
    argValue('--csv-out') ||
    `/tmp/farmdidi_whatsapp_import_${Date.now()}.csv`
  const accountIdArg = argValue('--account-id')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  if (!process.env.ENCRYPTION_KEY && !skipSend && !dryRun) {
    throw new Error('Missing ENCRYPTION_KEY (needed to decrypt WhatsApp token)')
  }

  const audience = await loadAudience(source)
  if (audience.length === 0) {
    throw new Error('No rows with phone numbers found in source')
  }
  writeImportCsv(audience, csvOut)
  console.log(
    `Audience: ${audience.length} unique phones from ${basename(source)}`,
  )

  if (dryRun) {
    console.log('Dry run — stopping after CSV write.')
    return
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { toMetaPhone, hasWhatsAppPhone } = await import(
    '../src/lib/whatsapp/phone-utils'
  )
  const { clampToIstSendWindow } = await import('../src/lib/shopify/send-window')
  const { engineSendTemplate } = await import('../src/lib/automations/meta-send')
  const { findOrCreateConversation } = await import(
    '../src/lib/inbox/find-or-create-conversation'
  )
  const { metadataWithSentStep } = await import('../src/lib/shopify/sequence-dedupe')

  const db = createClient(url, key)

  // Resolve DivyaPrabha (or sole) account + owner
  let accountId = accountIdArg
  let ownerUserId: string | undefined
  if (!accountId) {
    const { data: byName } = await db
      .from('accounts')
      .select('id, owner_user_id, name')
      .ilike('name', '%divyaprabha%')
      .limit(5)
    if (byName?.[0]) {
      accountId = byName[0].id
      ownerUserId = byName[0].owner_user_id
    }
  }
  if (!accountId) {
    const { data: workspaces } = await db
      .from('workspaces')
      .select('id, shopify_shop_domain, name')
      .or(
        'shopify_shop_domain.ilike.%divyaprabha%,name.ilike.%divyaprabha%',
      )
      .limit(5)
    if (workspaces?.[0]?.id) {
      // accounts.id is often synced 1:1 with workspaces.id (migration 042)
      accountId = workspaces[0].id
    }
  }
  if (!accountId) {
    const { data: withWa } = await db
      .from('whatsapp_config')
      .select('account_id')
      .limit(5)
    if ((withWa?.length || 0) === 1) {
      accountId = withWa![0].account_id
    }
  }
  if (!accountId) {
    const { data: accounts } = await db
      .from('accounts')
      .select('id, owner_user_id')
      .limit(5)
    if ((accounts?.length || 0) === 1) {
      accountId = accounts![0].id
      ownerUserId = accounts![0].owner_user_id
    }
  }
  if (!accountId) {
    throw new Error('Could not resolve account_id — pass --account-id')
  }

  const { data: account, error: accountErr } = await db
    .from('accounts')
    .select('id, owner_user_id')
    .eq('id', accountId)
    .single()
  if (accountErr || !account) throw accountErr || new Error('account missing')
  ownerUserId = account.owner_user_id || ownerUserId
  if (!ownerUserId) throw new Error('account has no owner_user_id')

  console.log(`Account ${accountId} owner ${ownerUserId}`)

  // Template must be APPROVED
  const { data: template } = await db
    .from('message_templates')
    .select('id, name, status, language, header_type, header_media_url')
    .eq('account_id', accountId)
    .eq('name', TEMPLATE_NAME)
    .maybeSingle()
  if (!template || String(template.status).toUpperCase() !== 'APPROVED') {
    throw new Error(
      `${TEMPLATE_NAME} is not APPROVED for this account (status=${template?.status ?? 'missing'}). Stop — do not send a cart/order template.`,
    )
  }

  // Ensure farmdidi tag
  const { data: existingTag } = await db
    .from('tags')
    .select('id, name')
    .eq('account_id', accountId)
    .ilike('name', TAG_NAME)
    .maybeSingle()
  let tagId = existingTag?.id as string | undefined
  if (!tagId) {
    const { data: created, error: tagErr } = await db
      .from('tags')
      .insert({
        user_id: ownerUserId,
        account_id: accountId,
        name: TAG_NAME,
        color: TAG_COLOR,
      })
      .select('id')
      .single()
    if (tagErr) throw tagErr
    tagId = created.id
  }

  // Upsert contacts
  const contactIds: string[] = []
  const contactByPhone = new Map<string, { id: string; name: string | null; phone: string }>()
  for (const row of audience) {
    const phone = toMetaPhone(row.phone)
    if (!hasWhatsAppPhone(phone)) continue

    const { data: existing } = await db
      .from('contacts')
      .select('id, phone, name, phone_normalized')
      .eq('account_id', accountId)
      .eq('phone_normalized', phone)
      .maybeSingle()

    const optInPatch = {
      marketing_opt_in: true,
      whatsapp_marketing_opt_in: true,
      marketing_opt_in_source: 'manual' as const,
      marketing_opt_in_at: new Date().toISOString(),
      marketing_opt_out_at: null,
    }

    let contactId: string
    if (existing) {
      contactId = existing.id
      const { error } = await db
        .from('contacts')
        .update({
          name: existing.name?.trim() ? existing.name : row.name,
          email: row.email || undefined,
          ...optInPatch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
      if (error) throw error
    } else {
      const { data: inserted, error } = await db
        .from('contacts')
        .insert({
          user_id: ownerUserId,
          account_id: accountId,
          phone,
          name: row.name,
          email: row.email || null,
          ...optInPatch,
        })
        .select('id, phone, name')
        .single()
      if (error) throw error
      contactId = inserted.id
    }

    await db.from('contact_tags').upsert(
      { contact_id: contactId, tag_id: tagId },
      { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
    )

    contactIds.push(contactId)
    contactByPhone.set(phone, {
      id: contactId,
      phone,
      name: row.name,
    })
  }
  console.log(`Imported/updated ${contactIds.length} contacts with tag ${TAG_NAME}`)

  // Verify tag count
  const { count: tagCount } = await db
    .from('contact_tags')
    .select('*', { count: 'exact', head: true })
    .eq('tag_id', tagId)
  console.log(`Tag ${TAG_NAME} now has ${tagCount ?? '?'} contacts`)

  // Resolve welcome sequence
  const { data: sequence } = await db
    .from('shopify_automation_sequences')
    .select('id, is_active, trigger_type')
    .eq('account_id', accountId)
    .eq('trigger_type', WELCOME_TRIGGER)
    .maybeSingle()
  if (!sequence?.id || !sequence.is_active) {
    throw new Error(
      `Active ${WELCOME_TRIGGER} sequence not found — apply bindings / activate New Shopify Contact Welcome`,
    )
  }

  const { data: step2 } = await db
    .from('shopify_automation_sequence_steps')
    .select('delay_minutes_from_previous_step, template_name, is_active')
    .eq('sequence_id', sequence.id)
    .eq('step_order', 2)
    .maybeSingle()
  const delayMinutes =
    step2?.delay_minutes_from_previous_step ?? FOLLOWUP_DELAY_MINUTES

  let sent = 0
  let failed = 0
  let enrolled = 0
  let skippedEnroll = 0

  let broadcastId: string | null = null
  if (!skipSend) {
    const { data: broadcast, error: bErr } = await db
      .from('broadcasts')
      .insert({
        user_id: ownerUserId,
        account_id: accountId,
        name: `Farmdidi festival ${new Date().toISOString().slice(0, 10)}`,
        template_name: TEMPLATE_NAME,
        template_language: template.language || 'en',
        template_variables: {
          '1': { type: 'field', value: 'name' },
        },
        audience_filter: { type: 'tags', tagIds: [tagId] },
        status: 'sending',
        total_recipients: contactIds.length,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        failed_count: 0,
      })
      .select('id')
      .single()
    if (bErr) throw bErr
    broadcastId = broadcast.id

    const recipientRows = contactIds.map((contact_id) => ({
      broadcast_id: broadcastId!,
      contact_id,
      status: 'pending' as const,
    }))
    const { error: rErr } = await db.from('broadcast_recipients').insert(recipientRows)
    if (rErr) throw rErr
  }

  for (const row of audience) {
    const phone = toMetaPhone(row.phone)
    const contact = contactByPhone.get(phone)
    if (!contact) continue

    if (!skipSend) {
      const conv = await findOrCreateConversation(db, {
        accountId,
        userId: ownerUserId,
        contactId: contact.id,
      })
      if (!conv) {
        failed++
        if (broadcastId) {
          await db
            .from('broadcast_recipients')
            .update({
              status: 'failed',
              error_message: 'no conversation',
            })
            .eq('broadcast_id', broadcastId)
            .eq('contact_id', contact.id)
        }
        continue
      }

      try {
        const res = await engineSendTemplate({
          accountId,
          userId: ownerUserId,
          conversationId: conv.id,
          contactId: contact.id,
          templateName: TEMPLATE_NAME,
          params: [contact.name || row.name || 'there'],
          language: template.language || undefined,
        })
        sent++
        if (broadcastId) {
          await db
            .from('broadcast_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              whatsapp_message_id: res.whatsapp_message_id ?? null,
            })
            .eq('broadcast_id', broadcastId)
            .eq('contact_id', contact.id)
        }
      } catch (err) {
        failed++
        const message = err instanceof Error ? err.message : String(err)
        console.error(`send failed ${phone}:`, message)
        if (broadcastId) {
          await db
            .from('broadcast_recipients')
            .update({
              status: 'failed',
              error_message: message.slice(0, 500),
            })
            .eq('broadcast_id', broadcastId)
            .eq('contact_id', contact.id)
        }
      }

      // Gentle pacing for Meta
      await new Promise((r) => setTimeout(r, 400))
    }

    // Enroll welcome drip at step 2 (shop-now), skip if already in progress
    const { data: existingTrack } = await db
      .from('shopify_recovery_tracking')
      .select('id, status')
      .eq('contact_id', contact.id)
      .eq('sequence_id', sequence.id)
      .eq('status', 'in_progress')
      .maybeSingle()

    if (existingTrack) {
      skippedEnroll++
      continue
    }

    let nextSendAt = new Date(Date.now() + delayMinutes * 60_000)
    nextSendAt = clampToIstSendWindow(nextSendAt)

    const metadata = skipSend
      ? {
          source: 'farmdidi_festival_outreach',
          festival_broadcast_id: broadcastId,
          sent_steps: [] as number[],
        }
      : metadataWithSentStep(
          {
            source: 'farmdidi_festival_outreach',
            festival_broadcast_id: broadcastId,
          },
          1,
        )

    const { error: enrollErr } = await db.from('shopify_recovery_tracking').insert({
      account_id: accountId,
      contact_id: contact.id,
      sequence_id: sequence.id,
      current_step: 2,
      status: 'in_progress',
      next_send_at: nextSendAt.toISOString(),
      metadata,
    })
    if (enrollErr) {
      if (enrollErr.code === '23505') {
        skippedEnroll++
      } else {
        console.error(`enroll failed ${phone}:`, enrollErr.message)
      }
    } else {
      enrolled++
    }
  }

  if (broadcastId) {
    await db
      .from('broadcasts')
      .update({
        status: failed === contactIds.length ? 'failed' : 'completed',
        sent_count: sent,
        failed_count: failed,
      })
      .eq('id', broadcastId)
  }

  console.log(
    JSON.stringify(
      {
        audience: audience.length,
        csvOut,
        tagId,
        tagCount,
        broadcastId,
        sent,
        failed,
        enrolled,
        skippedEnroll,
        followupDelayMinutes: delayMinutes,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
