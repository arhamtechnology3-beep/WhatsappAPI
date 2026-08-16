import { describe, expect, it } from 'vitest'
import {
  SHOPIFY_TEMPLATE_LIBRARY,
  assertRecipeMetaSafe,
  buildRecipeButtonParams,
  urlButtonParamFromAbsolute,
} from './whatsapp-template-library'

describe('SHOPIFY_TEMPLATE_LIBRARY', () => {
  it('keeps every recipe Meta-safe', () => {
    expect(SHOPIFY_TEMPLATE_LIBRARY.length).toBeGreaterThanOrEqual(9)
    for (const recipe of SHOPIFY_TEMPLATE_LIBRARY) {
      expect(() => assertRecipeMetaSafe(recipe)).not.toThrow()
    }
  })

  it('keeps the live automation template names', () => {
    const names = SHOPIFY_TEMPLATE_LIBRARY.map((r) => r.template_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'wacrm_cart_abandoned_v1',
        'wacrm_cart_reminder_step2_v1',
        'wacrm_cart_reminder_step3_v1',
        'wacrm_browse_abandoned_v1',
        'wacrm_order_confirmed_v1',
        'wacrm_order_shipped_v1',
        'wacrm_order_delivered_v1',
        'wacrm_cod_confirmation_v1',
        'wacrm_festival_broadcast_v1',
      ]),
    )
  })

  it('uses image headers and no raw https in body', () => {
    for (const recipe of SHOPIFY_TEMPLATE_LIBRARY) {
      expect(recipe.header_type).toBe('image')
      expect(recipe.body).not.toMatch(/https?:\/\//i)
    }
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

describe('buildRecipeButtonParams', () => {
  it('fills Complete Purchase from checkout_url', () => {
    const recipe = SHOPIFY_TEMPLATE_LIBRARY.find(
      (r) => r.template_name === 'wacrm_cart_abandoned_v1',
    )!
    const params = buildRecipeButtonParams(recipe, {
      checkout_url: 'https://divyaprabhafoods.com/checkouts/cn/xyz',
    })
    expect(params[0]).toBe('checkouts/cn/xyz')
    expect(params[1]).toBeUndefined()
  })
})
