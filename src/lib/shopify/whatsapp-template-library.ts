import type { TemplateButton, TemplateSampleValues } from '@/types'
import { extractVariableIndices } from '@/lib/whatsapp/template-validators'

/** Meta language for wacrm Shopify templates. Must match the approved Graph locale. */
export const WACRM_TEMPLATE_LANGUAGE = 'en_US'

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

export function storefrontBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_STOREFRONT_URL ||
    process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ||
    'https://divyaprabhafoods.com'
  const withProto = raw.startsWith('http') ? raw : `https://${raw}`
  return withProto.replace(/\/$/, '')
}

export function shopFromWhatsAppUrl(): string {
  return `${storefrontBaseUrl()}/`
}

export function bestsellersUrl(): string {
  return `${storefrontBaseUrl()}/collections/all`
}

export function dynamicStorefrontUrl(): string {
  return `${storefrontBaseUrl()}/{{1}}`
}

export function defaultHeaderImageUrl(): string {
  return (
    process.env.WHATSAPP_DEFAULT_HEADER_IMAGE_URL ||
    `${storefrontBaseUrl()}/cdn/shop/files/share.jpg`
  )
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
        urlButtonParamFromAbsolute(urls.product_url) || 'collections/all'
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
  url: dynamicStorefrontUrl(),
  example: 'account/orders',
})

const shopNow = (): TemplateButton => ({
  type: 'URL',
  text: 'Shop Now',
  url: shopFromWhatsAppUrl(),
})

export const SHOPIFY_TEMPLATE_LIBRARY: readonly ShopifyTemplateRecipe[] = [
  {
    trigger_type: 'cart_abandoned',
    template_name: 'wacrm_cart_abandoned_v1',
    category: 'MARKETING',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Namaste {{1}}! Aapka cart wait kar raha hai 🛒
{{2}} — abhi bhi available hai!

✅ Handmade, no chemical preservatives
✅ COD available | Free shipping above ₹499
✅ 3% OFF on prepaid

Complete purchase se order confirm karo.`,
    variables: ['customer_name', 'product_name'],
    default_delay_minutes: 20,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [completePurchase(), shopFromWhatsApp()],
    button_url_sources: ['checkout_url', null],
    sample_values: { body: ['Jesal', 'Nani Trial Pack'] },
  },
  {
    trigger_type: 'cart_abandoned_step2',
    template_name: 'wacrm_cart_reminder_step2_v1',
    category: 'MARKETING',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Jaldi karo {{1}}! 🔥
{{2}} mein se kuch fast moving hai.

✅ Hygienically handmade
✅ #1 pickle bestsellers
✅ Stock khatam hone se pehle lock karo

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
    template_name: 'wacrm_cart_reminder_step3_v1',
    category: 'MARKETING',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Namaste {{1}}! Code {{3}} se abhi milega extra OFF! 🎁
{{2}} abhi bhi cart mein saved hai.

✅ Offer aaj ke liye
✅ COD available
✅ Free shipping above ₹499

Complete purchase pe code apply ho jayega.`,
    variables: ['customer_name', 'product_name', 'discount_code'],
    default_delay_minutes: 1440,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [completePurchase(), shopFromWhatsApp()],
    button_url_sources: ['checkout_url', null],
    sample_values: { body: ['Jesal', 'Nani Trial Pack', 'WACRM10'] },
  },
  {
    trigger_type: 'browse_abandoned',
    template_name: 'wacrm_browse_abandoned_v1',
    category: 'MARKETING',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Abhi bhi soch rahe ho {{2}} ke baare mein, {{1}}? 🤔

✅ Handmade by didis — no chemical preservatives
✅ Hygienic glass jar
✅ COD available | Free shipping above ₹499

Try karo aur khud decide karo!`,
    variables: ['customer_name', 'product_name'],
    default_delay_minutes: 90,
    header_type: 'image',
    footer_text: 'DivyaPrabha Foods',
    buttons: [orderNow(), shopFromWhatsApp()],
    button_url_sources: ['product_url', null],
    sample_values: { body: ['Jesal', 'Homemade Mango Pickle'] },
  },
  {
    trigger_type: 'order_created',
    template_name: 'wacrm_order_confirmed_v1',
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
    button_url_sources: ['tracking_url', null],
    sample_values: { body: ['Jesal', '1001', '599.00'] },
  },
  {
    trigger_type: 'order_fulfilled',
    template_name: 'wacrm_order_shipped_v1',
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
    button_url_sources: ['tracking_url', null],
    sample_values: { body: ['Jesal', '1001'] },
  },
  {
    trigger_type: 'order_delivered',
    template_name: 'wacrm_order_delivered_v1',
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
    template_name: 'wacrm_cod_confirmation_v1',
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
    template_name: 'wacrm_festival_broadcast_v1',
    category: 'MARKETING',
    language: WACRM_TEMPLATE_LANGUAGE,
    body: `Namaste {{1}}! Festival ka swad ghar le aao! 🎁
DivyaPrabha handmade pickles — gift-ready packing.

✅ No chemical preservatives
✅ COD available | Free shipping above ₹499
✅ 3% OFF on prepaid

Shop Now se bestsellers dekho.`,
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
  return SHOPIFY_TEMPLATE_LIBRARY.find((r) => r.template_name === name)
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
