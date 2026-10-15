import { describe, expect, it } from 'vitest'
import {
  SHOPIFY_TEMPLATE_LIBRARY,
  assertRecipeMetaSafe,
  buildRecipeButtonParams,
  canonicalRecipeName,
  DEFAULT_HEADER_IMAGE_URL,
  defaultHeaderImageUrl,
  recipeByName,
  urlButtonParamFromAbsolute,
  coerceUrlButtonParam,
  coerceTemplateButtonParams,
  buildTemplateCustomerView,
  inboxTemplateCustomerView,
  dynamicStorefrontUrl,
  templateHasMediaHeader,
  resolveTemplateHeaderKind,
  CART_STEP3_NO_CODE_TEMPLATE,
  isCodedCartStep3Template,
  isOrderTemplateName,
  REFILL_FOLLOWUP_TEMPLATE,
  REFILL_REMINDER_TEMPLATE,
  REVIEW_REMINDER_TEMPLATE,
  REVIEW_REQUEST_TEMPLATE,
  WHATSAPP_LINK_ORIGIN,
  appendWcidToSuffix,
} from './whatsapp-template-library'

describe('SHOPIFY_TEMPLATE_LIBRARY', () => {
  it('keeps every recipe Meta-safe', () => {
    expect(SHOPIFY_TEMPLATE_LIBRARY.length).toBeGreaterThanOrEqual(9)
    for (const recipe of SHOPIFY_TEMPLATE_LIBRARY) {
      expect(() => assertRecipeMetaSafe(recipe)).not.toThrow()
      expect(recipe.body.trim().startsWith('{{')).toBe(false)
      expect(recipe.body.trim().endsWith('}}')).toBe(false)
    }
  })

  it('keeps the live automation template names', () => {
    const names = SHOPIFY_TEMPLATE_LIBRARY.map((r) => r.template_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'wacrm_cart_abandoned_v4',
        'wacrm_cart_reminder_step2_v2',
        'wacrm_cart_reminder_step3_v2',
        'wacrm_browse_abandoned_v2',
        'wacrm_order_confirmed_v2',
        'wacrm_order_shipped_v2',
        'wacrm_order_delivered_v2',
        'wacrm_cod_confirmation_v2',
        'wacrm_festival_broadcast_v2',
        'wacrm_shop_now_followup_v1',
        'wacrm_order_in_transit_v1',
        'wacrm_order_ofd_v1',
        'wacrm_order_ndr_v1',
      ]),
    )
  })

  it('cart step 3 v3 has no coupon code and states the auto-applied offer', () => {
    const v3 = recipeByName(CART_STEP3_NO_CODE_TEMPLATE)!
    expect(v3.template_name).toBe('wacrm_cart_reminder_step3_v3')
    expect(v3.variables).toEqual(['customer_name', 'product_name'])
    expect(v3.body).not.toMatch(/code/i)
    expect(v3.body).toContain('✨ *10% Discount & FREE Shipping auto-applied at checkout!*')
    expect(isCodedCartStep3Template('wacrm_cart_reminder_step3_v1')).toBe(true)
    expect(isCodedCartStep3Template('wacrm_cart_reminder_step3_v2')).toBe(true)
    expect(isCodedCartStep3Template('wacrm_cart_reminder_step3_v3')).toBe(false)
    expect(isCodedCartStep3Template('wacrm_cart_reminder_step2_v2')).toBe(false)
  })

  it('uses current offers and the custom-domain storefront', () => {
    for (const recipe of SHOPIFY_TEMPLATE_LIBRARY) {
      expect(recipe.body).not.toMatch(/3%\s*OFF/i)
      expect(recipe.body).not.toMatch(/prepaid/i)
      expect(recipe.body).not.toMatch(/₹499/)
      recipe.buttons.forEach((b, index) => {
        if (b.type !== 'URL') return
        if (recipe.button_url_sources[index] === 'followup_token') {
          expect(b.url.startsWith(`${WHATSAPP_LINK_ORIGIN}/`)).toBe(true)
        } else {
          expect(b.url).toContain('divyaprabhafoods.com')
        }
        expect(b.url).not.toMatch(/myshopify/i)
      })
    }
    const festival = SHOPIFY_TEMPLATE_LIBRARY.find(
      (r) => r.template_name === 'wacrm_festival_broadcast_v2',
    )!
    const shopNow = festival.buttons.find((b) => b.type === 'URL' && b.text === 'Shop Now')
    expect(shopNow && shopNow.type === 'URL' && shopNow.url).toContain(
      'collections/all-products',
    )
  })

  it('uses a static Track Order URL on Utility templates (no {{1}})', () => {
    for (const name of [
      'wacrm_order_confirmed_v2',
      'wacrm_order_shipped_v2',
      'wacrm_order_in_transit_v1',
      'wacrm_order_ofd_v1',
    ]) {
      const recipe = SHOPIFY_TEMPLATE_LIBRARY.find((r) => r.template_name === name)!
      const track = recipe.buttons.find((b) => b.type === 'URL' && b.text === 'Track Order')
      expect(track && track.type === 'URL' && track.url).toBe(
        'https://divyaprabhafoods.com/account/orders',
      )
      expect(track && track.type === 'URL' && track.url).not.toMatch(/\{\{/)
    }
  })

  it('uses a live PNG as the default header image', () => {
    expect(defaultHeaderImageUrl()).toBe(DEFAULT_HEADER_IMAGE_URL)
    expect(DEFAULT_HEADER_IMAGE_URL).not.toMatch(/share\.jpg/)
    expect(DEFAULT_HEADER_IMAGE_URL).toMatch(/\.png|\.jpe?g/i)
  })
})

describe('urlButtonParamFromAbsolute', () => {
  it('strips origin for Meta URL-button suffixes', () => {
    expect(
      urlButtonParamFromAbsolute(
        'https://divyaprabhafoods.com/checkouts/cn/abc?key=1',
      ),
    ).toBe('checkouts/cn/abc?key=1')
  })
})

describe('coerceUrlButtonParam', () => {
  it('converts a pasted checkout URL into the Meta suffix', () => {
    expect(
      coerceUrlButtonParam(
        dynamicStorefrontUrl(),
        'https://divyaprabhafoods.com/checkouts/cn/xyz?key=1',
      ),
    ).toBe('checkouts/cn/xyz')
  })

  it('ignores static URL buttons', () => {
    expect(
      coerceUrlButtonParam(
        'https://divyaprabhafoods.com/collections/all-products',
        'https://example.com/x',
      ),
    ).toBeUndefined()
  })

  it('keeps an already-relative suffix', () => {
    expect(coerceUrlButtonParam(dynamicStorefrontUrl(), '/checkouts/cn/a')).toBe(
      'checkouts/cn/a',
    )
  })

  it('preserves wcid while stripping other query junk', () => {
    expect(
      coerceUrlButtonParam(
        dynamicStorefrontUrl(),
        'https://divyaprabhafoods.com/checkouts/cn/xyz?key=1&wcid=tok',
      ),
    ).toBe('checkouts/cn/xyz?wcid=tok')
  })
})

describe('appendWcidToSuffix / buildRecipeButtonParams', () => {
  it('tags checkout URL suffixes with wcid', () => {
    expect(appendWcidToSuffix('checkouts/cn/a', 'tok')).toBe(
      'checkouts/cn/a?wcid=tok',
    )
    const recipe = recipeByName('wacrm_cart_abandoned_v4')!
    const params = buildRecipeButtonParams(recipe, {
      checkout_url: 'https://divyaprabhafoods.com/checkouts/cn/abc',
      wcid: 'abc123',
    })
    expect(params[0]).toBe('checkouts/cn/abc?wcid=abc123')
  })

  it('includes the visit nudge recipe', () => {
    expect(recipeByName('wacrm_visit_nudge_v1')?.trigger_type).toBe(
      'visit_nudge',
    )
  })
})

describe('coerceTemplateButtonParams', () => {
  it('only fills dynamic URL buttons', () => {
    const recipe = recipeByName('wacrm_cart_abandoned_v4')!
    const params = coerceTemplateButtonParams(recipe.buttons, {
      0: 'https://divyaprabhafoods.com/checkouts/cn/abc',
      1: 'https://divyaprabhafoods.com/collections/all-products',
    })
    expect(params).toEqual({ 0: 'checkouts/cn/abc' })
  })
})

describe('templateHasMediaHeader', () => {
  it('uses the Farm Didi recipe when the synced row has no header_type', () => {
    expect(
      templateHasMediaHeader({
        name: 'wacrm_festival_broadcast_v2',
        header_type: null,
      }),
    ).toBe(true)
    expect(resolveTemplateHeaderKind({ name: 'wacrm_festival_broadcast_v2' })).toBe(
      'image',
    )
  })

  it('treats a stored header_handle as an IMAGE header', () => {
    expect(
      templateHasMediaHeader({
        name: 'custom_promo',
        header_handle: '4::abc',
      }),
    ).toBe(true)
  })
})

describe('inboxTemplateCustomerView', () => {
  it('falls back to the recipe header image and CTAs', () => {
    const view = inboxTemplateCustomerView({
      template_name: 'wacrm_festival_broadcast_v2',
    })
    expect(view.header_type).toBe('image')
    expect(view.header_media_url).toBe(DEFAULT_HEADER_IMAGE_URL)
    expect(view.buttons?.map((b) => b.text)).toEqual([
      'Shop Now',
      'Shop From WhatsApp',
    ])
  })

  it('prefers persisted payload URLs', () => {
    const view = inboxTemplateCustomerView({
      template_name: 'wacrm_cart_abandoned_v4',
      media_url: 'https://cdn.example/product.png',
      template_payload: buildTemplateCustomerView(
        recipeByName('wacrm_cart_abandoned_v4')!,
        { buttonParams: { 0: 'checkouts/cn/abc' } },
      ),
    })
    expect(view.header_media_url).toBe('https://cdn.example/product.png')
    const purchase = view.buttons?.find((b) => b.type === 'URL' && b.text === 'Complete Purchase')
    expect(purchase && purchase.type === 'URL' ? purchase.url : '').toContain(
      'checkouts/cn/abc',
    )
  })
})

describe('buildRecipeButtonParams', () => {
  it('fills Complete Purchase from checkout_url', () => {
    const recipe = SHOPIFY_TEMPLATE_LIBRARY.find(
      (r) => r.template_name === 'wacrm_cart_abandoned_v4',
    )!
    const params = buildRecipeButtonParams(recipe, {
      checkout_url: 'https://divyaprabhafoods.com/checkouts/cn/xyz',
    })
    expect(params[0]).toBe('checkouts/cn/xyz')
    expect(params[1]).toBeUndefined()
  })

  it('fills review and reorder buttons with the follow-up token', () => {
    const review = recipeByName(REVIEW_REQUEST_TEMPLATE)!
    expect(review.buttons[0]).toMatchObject({
      type: 'URL',
      url: 'https://whatsapp.arhamtechnology.com/review/{{1}}',
    })
    expect(buildRecipeButtonParams(review, { followup_token: 'k3Xb9QmZ2a' })).toEqual({
      0: 'k3Xb9QmZ2a',
    })
    const refill = recipeByName(REFILL_REMINDER_TEMPLATE)!
    expect(refill.buttons.map((b) => b.text)).toEqual(['Reorder Now', 'Stop reminders'])
    expect(buildRecipeButtonParams(refill, { followup_token: 'tok12345' })).toEqual({
      0: 'tok12345',
    })
  })

  it('uses the order product photo on review and refill messages', () => {
    for (const name of [
      REVIEW_REQUEST_TEMPLATE,
      REVIEW_REMINDER_TEMPLATE,
      REFILL_REMINDER_TEMPLATE,
      REFILL_FOLLOWUP_TEMPLATE,
    ]) {
      expect(isOrderTemplateName(name)).toBe(true)
    }
    expect(recipeByName(REVIEW_REQUEST_TEMPLATE)!.category).toBe('UTILITY')
    expect(recipeByName(REFILL_REMINDER_TEMPLATE)!.category).toBe('MARKETING')
  })

  it('sends no URL suffix for static Track Order buttons', () => {
    const recipe = SHOPIFY_TEMPLATE_LIBRARY.find(
      (r) => r.template_name === 'wacrm_order_confirmed_v2',
    )!
    const params = buildRecipeButtonParams(recipe, {
      tracking_url: 'https://divyaprabhafoods.com/account/orders',
    })
    expect(params).toEqual({})
  })

  it('resolves old cart abandoned names to v4', () => {
    expect(canonicalRecipeName('wacrm_cart_abandoned_v2')).toBe(
      'wacrm_cart_abandoned_v4',
    )
    expect(recipeByName('wacrm_cod_confirmation_v1')?.template_name).toBe(
      'wacrm_cod_confirmation_v2',
    )
  })
})
