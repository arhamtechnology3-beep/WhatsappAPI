export interface ShopifyTemplateRecipe {
  trigger_type: 'cart_abandoned' | 'order_created' | 'order_fulfilled' | 'order_delivered' | 'browse_abandoned' | 'cart_abandoned_step2' | 'cart_abandoned_step3'
  template_name: string
  category: 'MARKETING' | 'UTILITY'
  language: string
  body: string
  variables: readonly string[]
  default_delay_minutes: number
}

export const SHOPIFY_TEMPLATE_LIBRARY: readonly ShopifyTemplateRecipe[] = [
  {
    trigger_type: 'cart_abandoned',
    template_name: 'wacrm_cart_abandoned_v1',
    category: 'MARKETING',
    language: 'en',
    body: "Hi {{1}}, you left {{2}} in your cart at {{3}}. Complete your order here: {{4}}",
    variables: ['customer_name', 'product_name', 'store_name', 'checkout_url'],
    default_delay_minutes: 30,
  },
  {
    trigger_type: 'cart_abandoned_step2',
    template_name: 'wacrm_cart_reminder_step2_v1',
    category: 'MARKETING',
    language: 'en',
    body: "Hi {{1}}, still thinking it over? {{2}} is waiting for you at ₹{{3}}. Reply STOP to stop these updates.",
    variables: ['customer_name', 'product_name', 'total_price'],
    default_delay_minutes: 1440,
  },
  {
    trigger_type: 'cart_abandoned_step3',
    template_name: 'wacrm_cart_reminder_step3_v1',
    category: 'MARKETING',
    language: 'en',
    body: "Hi {{1}}, here's 10% off to help you decide: use code {{4}} on {{2}}, valid 24 hours. Complete your order: {{3}}. Reply STOP to stop these updates.",
    variables: ['customer_name', 'product_name', 'checkout_url', 'discount_code'],
    default_delay_minutes: 1440,
  },
  {
    trigger_type: 'browse_abandoned',
    template_name: 'wacrm_browse_abandoned_v1',
    category: 'MARKETING',
    language: 'en',
    body: "Hi {{1}}, still interested in {{2}}? It's ₹{{3}}. Check it out: {{4}}. Reply STOP to stop these updates.",
    variables: ['customer_name', 'product_name', 'total_price', 'product_url'],
    default_delay_minutes: 30,
  },
  {
    trigger_type: 'order_created',
    template_name: 'wacrm_order_confirmed_v1',
    category: 'UTILITY',
    language: 'en',
    body: "Hi {{1}}, your order #{{2}} of ₹{{3}} is confirmed! We'll notify you when it ships.",
    variables: ['customer_name', 'order_number', 'total_price'],
    default_delay_minutes: 0,
  },
  {
    trigger_type: 'order_fulfilled',
    template_name: 'wacrm_order_shipped_v1',
    category: 'UTILITY',
    language: 'en',
    body: "Hi {{1}}, your order #{{2}} has shipped! Track it here: {{3}}",
    variables: ['customer_name', 'order_number', 'tracking_url'],
    default_delay_minutes: 0,
  },
  {
    trigger_type: 'order_delivered',
    template_name: 'wacrm_order_delivered_v1',
    category: 'UTILITY',
    language: 'en',
    body: "Hi {{1}}, your order #{{2}} was delivered. We hope you love it! Reply to this message if you need anything.",
    variables: ['customer_name', 'order_number'],
    default_delay_minutes: 0,
  },
  {
    trigger_type: 'order_created',
    template_name: 'wacrm_cod_confirmation_v1',
    category: 'UTILITY',
    language: 'en',
    body: "Hi {{1}}, please confirm your Cash on Delivery order #{{2}} of ₹{{3}} by clicking the button below.",
    variables: ['customer_name', 'order_number', 'total_price'],
    default_delay_minutes: 0,
  },
] as const;
