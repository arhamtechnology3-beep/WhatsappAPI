import type { TemplateButton, TemplateSampleValues } from '@/types'
import { extractVariableIndices } from '@/lib/whatsapp/template-validators'

/** Meta language for wacrm Shopify templates. Must match the approved Graph locale. */
export const WACRM_TEMPLATE_LANGUAGE = 'en_US'

/**
 * Older names already exist on the live WABA (en_US). Meta rejects recreate.
 * Cart abandoned v1–v3 were all used before; the live recipe is v4.
 * Install recipes remaps automations to these canonical names.
 */
export const RECIPE_NAME_RENAMES: Readonly<Record<string, string>> = {
  wacrm_cart_abandoned_v1: 'wacrm_cart_abandoned_v4',
  wacrm_cart_abandoned_v2: 'wacrm_cart_abandoned_v4',
  wacrm_cart_abandoned_v3: 'wacrm_cart_abandoned_v4',
  wacrm_cart_reminder_step2_v1: 'wacrm_cart_reminder_step2_v2',
  wacrm_cart_reminder_step3_v1: 'wacrm_cart_reminder_step3_v2',
  wacrm_browse_abandoned_v1: 'wacrm_browse_abandoned_v2',
  wacrm_order_confirmed_v1: 'wacrm_order_confirmed_v2',
  wacrm_order_shipped_v1: 'wacrm_order_shipped_v2',
  wacrm_order_delivered_v1: 'wacrm_order_delivered_v2',
  wacrm_cod_confirmation_v1: 'wacrm_cod_confirmation_v2',
  wacrm_festival_broadcast_v1: 'wacrm_festival_broadcast_v2',
}

export function canonicalRecipeName(name: string): string {
  return RECIPE_NAME_RENAMES[name] ?? name
}

export type ShopifyRecipeTrigger =
  | 'cart_abandoned'
  | 'cart_abandoned_step2'
  | 'cart_abandoned_step3'
  | 'browse_abandoned'
  | 'order_created'
  | 'order_fulfilled'
  | 'order_delivered'
  | 'broadcast'

export type RecipeUrlSource =
  | 'checkout_url'
  | 'product_url'
  | 'tracking_url'
  | 'storefront'
  | null

export interface ShopifyTemplateRecipe {
  trigger_type: ShopifyRecipeTrigger
  template_name: string
  category: 'MARKETING' | 'UTILITY'
  language: string
  body: string
  variables: readonly string[]
  default_delay_minutes: number
  header_type: 'image'
  footer_text?: string
  buttons: TemplateButton[]
  /** Parallel to `buttons`: which send-time URL fills a dynamic URL button. */
  button_url_sources: readonly RecipeUrlSource[]
  sample_values: TemplateSampleValues
}

/** Customer-facing store. Never use the *.myshopify.com admin hostname. */
export const STOREFRONT_ORIGIN = 'https://divyaprabhafoods.com'
export const COLLECTION_ALL_PRODUCTS_PATH = 'collections/all-products'

export function storefrontBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_STOREFRONT_URL || STOREFRONT_ORIGIN).trim()
  const withProto = raw.startsWith('http') ? raw : `https://${raw}`
  if (/myshopify\.com/i.test(withProto)) return STOREFRONT_ORIGIN
  return withProto.replace(/\/$/, '')
}

export function shopFromWhatsAppUrl(): string {
  return `${storefrontBaseUrl()}/`
}

export function collectionAllProductsUrl(): string {
  return `${storefrontBaseUrl()}/${COLLECTION_ALL_PRODUCTS_PATH}`
}

export function bestsellersUrl(): string {
  return collectionAllProductsUrl()
}

export function dynamicStorefrontUrl(): string {
  return `${storefrontBaseUrl()}/{{1}}`
}

/** Public JPEG/PNG that currently 200s on the live store (share.jpg / Gor_Keri.jpg 404). */
export const DEFAULT_HEADER_IMAGE_URL =
  'https://divyaprabhafoods.com/cdn/shop/files/WhatsApp_Image_2025-04-12_at_4.37.20_PM.png?v=1744459199'

export function defaultHeaderImageUrl(): string {
  return process.env.WHATSAPP_DEFAULT_HEADER_IMAGE_URL || DEFAULT_HEADER_IMAGE_URL
}

/** Path+query for a Meta URL button registered as `https://store/{{1}}`. */
export function urlButtonParamFromAbsolute(
  fullUrl: string | null | undefined,
): string {
  if (!fullUrl?.trim()) return ''
  try {
    const u = new URL(fullUrl)
    return `${u.pathname.replace(/^\//, '')}${u.search}`
  } catch {
    return fullUrl.replace(/^https?:\/\/[^/]+\//, '')
  }
}

/**
 * Meta URL-button send params are the suffix that replaces `{{1}}`, never a
 * full `https://…` URL. Pasting a checkout link (or a coupon code) as the
 * variable makes Graph return `#100 Invalid parameter` and the inbox shows
 * a failed bubble with no buttons.
 */
export function coerceUrlButtonParam(
  templateButtonUrl: string,
  raw?: string | null,
): string | undefined {
  if (extractVariableIndices(templateButtonUrl).length === 0) return undefined
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return undefined
  if (/^https?:\/\//i.test(trimmed)) {
    return urlButtonParamFromAbsolute(trimmed) || undefined
  }
  return trimmed.replace(/^\//, '')
}

export function coerceTemplateButtonParams(
  buttons: TemplateButton[] | undefined,
  raw?: Record<number, string> | null,
): Record<number, string> | undefined {
  if (!buttons?.length) return undefined
  const out: Record<number, string> = {}
  buttons.forEach((btn, index) => {
    if (btn.type !== 'URL') return
    const coerced = coerceUrlButtonParam(btn.url, raw?.[index])
    if (coerced) out[index] = coerced
  })
  return Object.keys(out).length ? out : undefined
}

export function resolveHeaderMediaUrl(
  template: {
    header_type?: string | null
    header_media_url?: string | null
  },
  override?: string | null,
): string | undefined {
  const headerType = template.header_type
  if (
    headerType !== 'image' &&
    headerType !== 'video' &&
    headerType !== 'document'
  ) {
    return override?.trim() || undefined
  }
  return (
    override?.trim() ||
    template.header_media_url?.trim() ||
    defaultHeaderImageUrl()
  )
}

export interface TemplateCustomerView {
  header_type?: 'text' | 'image' | 'video' | 'document'
  header_media_url?: string
  header_text?: string
  footer_text?: string
  buttons?: TemplateButton[]
}

/** Snapshot stored on `messages.template_payload` so the inbox can render CTAs. */
export function buildTemplateCustomerView(
  template: {
    header_type?: 'text' | 'image' | 'video' | 'document' | null
    header_content?: string | null
    header_media_url?: string | null
    footer_text?: string | null
    buttons?: TemplateButton[] | null
  },
  params?: {
    headerText?: string
    headerMediaUrl?: string
    buttonParams?: Record<number, string>
  },
): TemplateCustomerView {
  const buttons = (template.buttons ?? []).map((btn, index) => {
    if (btn.type !== 'URL') return btn
    const suffix = coerceUrlButtonParam(btn.url, params?.buttonParams?.[index])
    if (!suffix) return btn
    return { ...btn, url: btn.url.replace(/\{\{1\}\}/g, suffix) }
  })
  const view: TemplateCustomerView = {
    header_type: template.header_type ?? undefined,
    footer_text: template.footer_text ?? undefined,
    buttons: buttons.length ? buttons : undefined,
  }
  if (template.header_type === 'text') {
    view.header_text =
      params?.headerText?.trim() || template.header_content || undefined
  } else {
    view.header_media_url = resolveHeaderMediaUrl(
      template,
      params?.headerMediaUrl,
    )
  }
  return view
}

export function buildRecipeButtonParams(
  recipe: ShopifyTemplateRecipe,
  urls: {
    checkout_url?: string
    product_url?: string
    tracking_url?: string
  },
): Record<number, string> {
  const out: Record<number, string> = {}
  recipe.buttons.forEach((button, index) => {
    if (button.type !== 'URL') return
    const source = recipe.button_url_sources[index]
    if (source === 'checkout_url') {
      out[index] =
        urlButtonParamFromAbsolute(urls.checkout_url) || 'checkouts'
    } else if (source === 'product_url') {
      out[index] =
        urlButtonParamFromAbsolute(urls.product_url) || COLLECTION_ALL_PRODUCTS_PATH
    } else if (source === 'tracking_url') {
      const tracking = urls.tracking_url || urls.checkout_url
      out[index] =
        urlButtonParamFromAbsolute(tracking) || 'account/orders'
    }
  })
  return out
}

const completePurchase = (): TemplateButton => ({
  type: 'URL',
  text: 'Complete Purchase',
  url: dynamicStorefrontUrl(),
  example: 'checkouts/cn/abc123',
})

const orderNow = (): TemplateButton => ({
  type: 'URL',
  text: 'Order Now',
  url: dynamicStorefrontUrl(),
  example: 'products/mango-pickle',
})

const shopFromWhatsApp = (): TemplateButton => ({
  type: 'URL',
  text: 'Shop From WhatsApp',
  url: shopFromWhatsAppUrl(),
})

const shopBestsellers = (): TemplateButton => ({
  type: 'URL',
  text: 'Shop Bestsellers',
  url: bestsellersUrl(),
})

const trackOrder = (): TemplateButton => ({
  type: 'URL',
  text: 'Track Order',
  url: `${storefrontBaseUrl()}/account/orders`,
})

const shopNow = (): TemplateButton => ({
  type: 'URL',
  text: 'Shop Now',
  url: collectionAllProductsUrl(),
})

export const SHOPIFY_TEMPLATE_LIBRARY: readonly ShopifyTemplateRecipe[] = [
  {
    trigger_type: 'cart_abandoned',
    template_name: 'wacrm_cart_abandoned_v4',
    category: 'MARKETING',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Namaste {{1}}! Aapka cart wait kar raha hai 🛒
{{2}} — abhi bhi available hai!

✅ Handmade, no chemical preservatives
✅ Buy 2 x 250g pickles — FREE shipping
✅ 10% OFF on ₹749+ | Free ship above ₹599

Complete purchase se order confirm karo.`,
    variables: ['customer_name', 'product_name'],
    default_delay_minutes: 20,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [completePurchase(), shopBestsellers()],
    button_url_sources: ['checkout_url', null],
    sample_values: { body: ['Jesal', 'Nani Trial Pack'] },
  },
  {
    trigger_type: 'cart_abandoned_step2',
    template_name: 'wacrm_cart_reminder_step2_v2',
    category: 'MARKETING',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Jaldi karo {{1}}! 🔥
{{2}} mein se kuch fast moving hai.

✅ Buy 2 x 250g pickles — FREE shipping
✅ 10% OFF on orders ₹749+
✅ FREE shipping above ₹599

Order confirm karo — cart abhi saved hai.`,
    variables: ['customer_name', 'product_name'],
    default_delay_minutes: 180,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [completePurchase(), shopBestsellers()],
    button_url_sources: ['checkout_url', null],
    sample_values: { body: ['Jesal', 'Mango pickle'] },
  },
  {
    trigger_type: 'cart_abandoned_step3',
    template_name: 'wacrm_cart_reminder_step3_v2',
    category: 'MARKETING',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Namaste {{1}}! Code {{3}} se abhi milega extra OFF! 🎁
{{2}} abhi bhi cart mein saved hai.

✅ Buy 2 x 250g pickles — FREE shipping
✅ 10% OFF on orders ₹749+
✅ FREE shipping above ₹599

Complete purchase pe code apply ho jayega.`,
    variables: ['customer_name', 'product_name', 'discount_code'],
    default_delay_minutes: 1440,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [completePurchase(), shopBestsellers()],
    button_url_sources: ['checkout_url', null],
    sample_values: { body: ['Jesal', 'Nani Trial Pack', 'WACRM10'] },
  },
  {
    trigger_type: 'browse_abandoned',
    template_name: 'wacrm_browse_abandoned_v2',
    category: 'MARKETING',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Abhi bhi soch rahe ho {{2}} ke baare mein, {{1}}? 🤔

✅ Handmade by didis — no chemical preservatives
✅ Buy 2 x 250g pickles — FREE shipping
✅ 10% OFF on ₹749+ | Free ship above ₹599

Try karo aur khud decide karo!`,
    variables: ['customer_name', 'product_name'],
    default_delay_minutes: 90,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [orderNow(), shopBestsellers()],
    button_url_sources: ['product_url', null],
    sample_values: { body: ['Jesal', 'Homemade Mango Pickle'] },
  },
  {
    trigger_type: 'order_created',
    template_name: 'wacrm_order_confirmed_v2',
    category: 'UTILITY',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Dhanyawad {{1}}! 🙏
Aapka order #{{2}} confirm ho gaya hai.

📦 Total: ₹{{3}}
Hum packing shuru kar rahe hain — tracking alag message mein aayegi.

✅ Fresh & hygienically packed
✅ Safe doorstep delivery`,
    variables: ['customer_name', 'order_number', 'total_price'],
    default_delay_minutes: 0,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [trackOrder(), shopFromWhatsApp()],
    button_url_sources: [null, null],
    sample_values: { body: ['Jesal', '1001', '599.00'] },
  },
  {
    trigger_type: 'order_fulfilled',
    template_name: 'wacrm_order_shipped_v2',
    category: 'UTILITY',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Aapka order #{{2}} ship ho gaya hai, {{1}}! 🚚

✅ Freshness sealed
✅ Contactless delivery
✅ Track button se live status dekho`,
    variables: ['customer_name', 'order_number'],
    default_delay_minutes: 0,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [trackOrder(), shopFromWhatsApp()],
    button_url_sources: [null, null],
    sample_values: { body: ['Jesal', '1001'] },
  },
  {
    trigger_type: 'order_delivered',
    template_name: 'wacrm_order_delivered_v2',
    category: 'UTILITY',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Namaste {{1}}! Aapka order #{{2}} pahunch gaya! 🥭❤️

Fridge zaroori nahi — dry jar, sookhe chamach se nikalein, swad mahino tak rahega.

✅ Handmade, no chemical preservatives
✅ Koi sawal ho to yahin reply karein`,
    variables: ['customer_name', 'order_number'],
    default_delay_minutes: 0,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [
      {
        type: 'URL',
        text: 'Rate Your Order',
        url: shopFromWhatsAppUrl(),
      },
      shopFromWhatsApp(),
    ],
    button_url_sources: [null, null],
    sample_values: { body: ['Jesal', '1001'] },
  },
  {
    trigger_type: 'order_created',
    template_name: 'wacrm_cod_confirmation_v2',
    category: 'UTILITY',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Namaste {{1}}! Aapka COD order #{{2}} of ₹{{3}} almost ready hai 😍

Confirm karein taaki packing aaj lock ho jaye.

✅ Fresh & hygienically packed
✅ 100% natural ingredients

Neeche Yes dabayein — Cancel se order ruk jayega.`,
    variables: ['customer_name', 'order_number', 'total_price'],
    default_delay_minutes: 0,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Yes, confirm order' },
      { type: 'QUICK_REPLY', text: 'Cancel order' },
    ],
    button_url_sources: [null, null],
    sample_values: { body: ['Jesal', '1001', '599.00'] },
  },
  {
    trigger_type: 'broadcast',
    template_name: 'wacrm_festival_broadcast_v2',
    category: 'MARKETING',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Namaste {{1}}! Festival ka swad ghar le aao! 🎁
DivyaPrabha handmade pickles — gift-ready packing.

✅ Buy 2 x 250g pickles — FREE shipping
✅ 10% OFF on orders ₹749+
✅ FREE shipping above ₹599

Shop Now se all products dekho.`,
    variables: ['customer_name'],
    default_delay_minutes: 0,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [shopNow(), shopFromWhatsApp()],
    button_url_sources: [null, null],
    sample_values: { body: ['Jesal'] },
  },
]

export function recipeByName(
  name: string,
): ShopifyTemplateRecipe | undefined {
  const canonical = canonicalRecipeName(name)
  return SHOPIFY_TEMPLATE_LIBRARY.find(
    (r) => r.template_name === name || r.template_name === canonical,
  )
}

/** Rebuild header + CTA chrome for an inbox bubble (payload, catalog, or recipe). */
export function inboxTemplateCustomerView(
  message: {
    template_name?: string | null
    media_url?: string | null
    template_payload?: TemplateCustomerView | null
  },
  catalog?: {
    header_type?: 'text' | 'image' | 'video' | 'document' | null
    header_content?: string | null
    header_media_url?: string | null
    footer_text?: string | null
    buttons?: TemplateButton[] | null
  } | null,
): TemplateCustomerView {
  const recipe = message.template_name
    ? recipeByName(message.template_name)
    : undefined
  const payload = message.template_payload
  const headerType =
    payload?.header_type || catalog?.header_type || recipe?.header_type
  const buttons =
    payload?.buttons?.length
      ? payload.buttons
      : catalog?.buttons?.length
        ? catalog.buttons
        : recipe?.buttons
  const footer =
    payload?.footer_text || catalog?.footer_text || recipe?.footer_text
  const headerText = payload?.header_text || catalog?.header_content || undefined
  const imageUrl =
    message.media_url ||
    payload?.header_media_url ||
    catalog?.header_media_url ||
    (headerType === 'image' || headerType === 'video' || headerType === 'document'
      ? defaultHeaderImageUrl()
      : undefined)
  return {
    header_type: headerType,
    header_media_url: imageUrl,
    header_text: headerText,
    footer_text: footer,
    buttons,
  }
}

export function recipeToDraftInsert(
  recipe: ShopifyTemplateRecipe,
  accountId: string,
  userId: string,
): Record<string, unknown> {
  return {
    account_id: accountId,
    user_id: userId,
    name: recipe.template_name,
    category: recipe.category === 'UTILITY' ? 'Utility' : 'Marketing',
    language: recipe.language,
    header_type: recipe.header_type,
    header_media_url: defaultHeaderImageUrl(),
    body_text: recipe.body,
    footer_text: recipe.footer_text ?? null,
    buttons: recipe.buttons,
    sample_values: recipe.sample_values,
    status: 'DRAFT',
    updated_at: new Date().toISOString(),
  }
}

/** Used by tests and install to catch Meta-invalid copy before submit. */
export function assertRecipeMetaSafe(recipe: ShopifyTemplateRecipe): void {
  const indices = extractVariableIndices(recipe.body)
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i + 1) {
      throw new Error(`${recipe.template_name}: body variables must be contiguous`)
    }
  }
  if (indices.length !== recipe.variables.length) {
    throw new Error(
      `${recipe.template_name}: variables[] length must match body {{n}} count`,
    )
  }
  if (recipe.body.length > 1024) {
    throw new Error(`${recipe.template_name}: body exceeds 1024 chars`)
  }
  if ((recipe.footer_text?.length ?? 0) > 60) {
    throw new Error(`${recipe.template_name}: footer exceeds 60 chars`)
  }
  if (recipe.buttons.length !== recipe.button_url_sources.length) {
    throw new Error(`${recipe.template_name}: button_url_sources length mismatch`)
  }
  for (const b of recipe.buttons) {
    if (b.text.length > 25) {
      throw new Error(`${recipe.template_name}: button "${b.text}" exceeds 25 chars`)
    }
  }
  if (recipe.body.trim().startsWith('{{')) {
    throw new Error(
      `${recipe.template_name}: body cannot start with a variable (Meta rule)`,
    )
  }
  if (recipe.body.trim().endsWith('}}')) {
    throw new Error(
      `${recipe.template_name}: body cannot end with a variable (Meta rule)`,
    )
  }
}
