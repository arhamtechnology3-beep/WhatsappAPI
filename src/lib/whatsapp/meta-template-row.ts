import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import { defaultHeaderImageUrl } from '@/lib/shopify/whatsapp-template-library'
import type { TemplateButton, TemplateSampleValues } from '@/types'

interface MetaButton {
  type: string
  text: string
  url?: string
  phone_number?: string
  example?: string[] | string
}

interface MetaTemplateComponent {
  type: string
  text?: string
  format?: string
  buttons?: MetaButton[]
  example?: {
    header_text?: string[]
    header_handle?: string[]
    body_text?: string[][]
  }
}

export interface MetaTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components?: MetaTemplateComponent[]
  quality_score?: { score?: string } | string
}

function normalizeCategory(meta: string): 'Marketing' | 'Utility' | 'Authentication' {
  const upper = meta.toUpperCase()
  if (upper === 'UTILITY') return 'Utility'
  if (upper === 'AUTHENTICATION') return 'Authentication'
  return 'Marketing'
}

function normalizeQualityScore(
  raw: MetaTemplate['quality_score'],
): 'GREEN' | 'YELLOW' | 'RED' | null {
  const score = typeof raw === 'string' ? raw : raw?.score ? String(raw.score) : null
  if (!score) return null
  const upper = score.toUpperCase()
  return upper === 'GREEN' || upper === 'YELLOW' || upper === 'RED'
    ? (upper as 'GREEN' | 'YELLOW' | 'RED')
    : null
}

function parseButtons(metaButtons: MetaButton[] | undefined): TemplateButton[] {
  if (!metaButtons?.length) return []
  const out: TemplateButton[] = []
  for (const b of metaButtons) {
    switch (b.type?.toUpperCase()) {
      case 'QUICK_REPLY':
        out.push({ type: 'QUICK_REPLY', text: b.text })
        break
      case 'URL':
        out.push({
          type: 'URL',
          text: b.text,
          url: b.url ?? '',
          example: Array.isArray(b.example) ? b.example[0] : b.example,
        })
        break
      case 'PHONE_NUMBER':
        out.push({ type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number ?? '' })
        break
      case 'COPY_CODE':
        out.push({
          type: 'COPY_CODE',
          text: b.text,
          example: Array.isArray(b.example) ? b.example[0] ?? '' : b.example ?? '',
        })
        break
      // OTP, FLOW, etc — out of scope for v1; drop silently.
    }
  }
  return out
}

function extractSampleValues(
  body: MetaTemplateComponent | undefined,
  header: MetaTemplateComponent | undefined,
): TemplateSampleValues | null {
  // Meta returns body_text as a 2D array — one row per example set.
  const bodySample = body?.example?.body_text?.[0]
  const headerSample = header?.example?.header_text
  if (!bodySample?.length && !headerSample?.length) return null
  const sv: TemplateSampleValues = {}
  if (bodySample?.length) sv.body = bodySample
  if (headerSample?.length) sv.header = headerSample
  return sv
}

/** `message_templates` row for a template fetched from the WABA. */
export function metaTemplateToRow(
  t: MetaTemplate,
  args: { accountId: string; userId: string; existingHeaderMediaUrl?: string | null },
) {
  const body = (t.components ?? []).find((c) => c.type === 'BODY')
  const header = (t.components ?? []).find((c) => c.type === 'HEADER')
  const footer = (t.components ?? []).find((c) => c.type === 'FOOTER')
  const buttons = (t.components ?? []).find((c) => c.type === 'BUTTONS')
  const parsedButtons = parseButtons(buttons?.buttons)

  const headerFormat = header?.format?.toUpperCase()
  const headerType =
    headerFormat === 'TEXT' ||
    headerFormat === 'IMAGE' ||
    headerFormat === 'VIDEO' ||
    headerFormat === 'DOCUMENT'
      ? headerFormat.toLowerCase()
      : null

  return {
    account_id: args.accountId,
    user_id: args.userId,
    name: t.name,
    category: normalizeCategory(t.category),
    language: t.language,
    header_type: headerType,
    header_content: header?.text ?? null,
    header_handle: header?.example?.header_handle?.[0] ?? null,
    header_media_url:
      args.existingHeaderMediaUrl ||
      (headerType === 'image' ? defaultHeaderImageUrl() : null),
    body_text: body?.text ?? '',
    footer_text: footer?.text ?? null,
    buttons: parsedButtons.length ? parsedButtons : null,
    sample_values: extractSampleValues(body, header),
    status: normalizeStatus(t.status),
    meta_template_id: t.id,
    quality_score: normalizeQualityScore(t.quality_score),
    updated_at: new Date().toISOString(),
  }
}
