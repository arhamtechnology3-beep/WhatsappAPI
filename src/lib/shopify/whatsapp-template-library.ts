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
    body: "Still thinking about {{2}}, {{1}}? 😉\n\nWe saw you checking it out and saved it in your cart at {{3}}! Grab it now before it sells out.\n\n✅ Fresh & hygienically packed\n✅ Chemical preservative free\n✅ Free shipping on orders above ₹499\n\n👉 Click below to complete your checkout in 1-click:\n{{4}}",
    variables: ['customer_name', 'product_name', 'store_name', 'checkout_url'],
    default_delay_minutes: 30,
  },
  {
    trigger_type: 'cart_abandoned_step2',
    template_name: 'wacrm_cart_reminder_step2_v1',
    category: 'MARKETING',
    language: 'en',
    body: "Still thinking about {{2}}? 🤔\n\nYour cart is waiting for you, {{1}}! Order today at only ₹{{3}} and experience authentic dadi-nani ka swad!\n\n✅ Hygienic packaging\n✅ Real ingredients, no preservatives\n✅ Cash on Delivery (COD) available\n\nReply STOP to opt out.",
    variables: ['customer_name', 'product_name', 'total_price'],
    default_delay_minutes: 1440,
  },
  {
    trigger_type: 'cart_abandoned_step3',
    template_name: 'wacrm_cart_reminder_step3_v1',
    category: 'MARKETING',
    language: 'en',
    body: "Hey {{1}}! 🎁\n\nHere is a special 10% OFF discount to help you decide. Use code {{4}} on {{2}} (valid for next 24 hours only!).\n\n✅ Handmade by local women\n✅ Guaranteed premium quality\n✅ Super fast doorstep delivery\n\n👉 Complete your order here:\n{{3}}\n\nReply STOP to opt out.",
    variables: ['customer_name', 'product_name', 'checkout_url', 'discount_code'],
    default_delay_minutes: 1440,
  },
  {
    trigger_type: 'browse_abandoned',
    template_name: 'wacrm_browse_abandoned_v1',
    category: 'MARKETING',
    language: 'en',
    body: "Hey {{1}}! 👀\n\nWe saw you checking out {{2}} at only ₹{{3}}. It's one of our best-sellers!\n\n✅ Handcrafted with care & love\n✅ Hygienic glass bottle packaging\n✅ Cash on Delivery (COD) available\n\n👉 Grab yours here before it's gone:\n{{4}}\n\nReply STOP to opt out.",
    variables: ['customer_name', 'product_name', 'total_price', 'product_url'],
    default_delay_minutes: 30,
  },
  {
    trigger_type: 'order_created',
    template_name: 'wacrm_order_confirmed_v1',
    category: 'UTILITY',
    language: 'en',
    body: "Woohoo! 🎉 Your order #{{2}} is confirmed, {{1}}!\n\nWe are preparing your fresh treats of ₹{{3}} with lots of love. We'll send you tracking details as soon as it ships! 🚚✨\n\n✅ Handcrafted with care\n✅ Preservative free\n✅ Fast doorstep delivery\n\nThank you for supporting handcrafted food! ❤️",
    variables: ['customer_name', 'order_number', 'total_price'],
    default_delay_minutes: 0,
  },
  {
    trigger_type: 'order_fulfilled',
    template_name: 'wacrm_order_shipped_v1',
    category: 'UTILITY',
    language: 'en',
    body: "Great news, {{1}}! 🚚\n\nYour order #{{2}} from DivyaPrabha Foods is on its way to you!\n\n✅ Freshness sealed\n✅ Contactless delivery\n✅ Safe transit tracking\n\n👉 Track your package here:\n{{3}} 🎉",
    variables: ['customer_name', 'order_number', 'tracking_url'],
    default_delay_minutes: 0,
  },
  {
    trigger_type: 'order_delivered',
    template_name: 'wacrm_order_delivered_v1',
    category: 'UTILITY',
    language: 'en',
    body: "Delivered! 🎁\n\nYour DivyaPrabha Foods order #{{2}} has been successfully delivered, {{1}}! We hope you absolutely love it.\n\n✅ Freshness & taste guaranteed\n✅ 100% natural ingredients\n\nReply here if you need any help! ❤️",
    variables: ['customer_name', 'order_number'],
    default_delay_minutes: 0,
  },
  {
    trigger_type: 'order_created',
    template_name: 'wacrm_cod_confirmation_v1',
    category: 'UTILITY',
    language: 'en',
    body: "Hey {{1}}! 😍 Your order #{{2}} of ₹{{3}} from DivyaPrabha Foods is almost ready to ship.\n\nSince you chose Cash on Delivery, please confirm below to lock in fast shipping! 🚀\n\n✅ Fresh & hygienically packed\n✅ 100% natural ingredients\n\n👇 Click 'Yes, confirm order' below to ship it today!",
    variables: ['customer_name', 'order_number', 'total_price'],
    default_delay_minutes: 0,
  },
] as const;
