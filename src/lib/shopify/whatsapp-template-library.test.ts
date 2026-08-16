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
      ]),
    )
  })

  it('uses current offers and the custom-domain storefront', () => {
    for (const recipe of SHOPIFY_TEMPLATE_LIBRARY) {
      expect(recipe.body).not.toMatch(/3%\s*OFF/i)
      expect(recipe.body).not.toMatch(/prepaid/i)
      expect(recipe.body).not.toMatch(/₹499/)
      for (const b of recipe.buttons) {
        if (b.type === 'URL') {
          expect(b.url).toContain('divyaprabhafoods.com')
          expect(b.url).not.toMatch(/myshopify/i)
        }
      }
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
