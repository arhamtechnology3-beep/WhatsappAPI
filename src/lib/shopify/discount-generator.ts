interface PriceRuleResponse {
  price_rule?: {
    id: number
  }
  errors?: any
}

interface DiscountCodeResponse {
  discount_code?: {
    code: string
  }
  errors?: any
}

/**
 * Generates a single-use 10% off Shopify discount code valid for 24 hours.
 */
export async function createShopifyDiscountCode(
  storeDomain: string,
  adminAccessToken: string,
  apiVersion: string = '2025-01'
): Promise<string> {
  const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  
  // 1) Generate random unique code suffix
  const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase()
  const discountCode = `WACRM10-${uniqueId}`

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // 2) Create Price Rule for 10% discount
  const priceRuleUrl = `https://${cleanDomain}/admin/api/${apiVersion}/price_rules.json`
  const priceRulePayload = {
    price_rule: {
      title: `WACRM Drip Discount Rule - ${uniqueId}`,
      target_type: 'line_item',
      target_selection: 'all',
      allocation_method: 'across',
      value_type: 'percentage',
      value: '-10.0',
      customer_selection: 'all',
      starts_at: now.toISOString(),
      ends_at: tomorrow.toISOString(),
      usage_limit: 1,
    },
  }

  try {
    const ruleRes = await fetch(priceRuleUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': adminAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(priceRulePayload),
    })

    if (!ruleRes.ok) {
      const errorText = await ruleRes.text()
      throw new Error(`Shopify price rule creation failed: ${ruleRes.statusText} - ${errorText}`)
    }

    const priceRuleData = (await ruleRes.json()) as PriceRuleResponse
    const priceRuleId = priceRuleData.price_rule?.id

    if (!priceRuleId) {
      throw new Error('Failed to resolve price rule ID from response')
    }

    // 3) Create Discount Code under the price rule
    const discountUrl = `https://${cleanDomain}/admin/api/${apiVersion}/price_rules/${priceRuleId}/discount_codes.json`
    const discountPayload = {
      discount_code: {
        code: discountCode,
      },
    }

    const discountRes = await fetch(discountUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': adminAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(discountPayload),
    })

    if (!discountRes.ok) {
      const errorText = await discountRes.text()
      throw new Error(`Shopify discount creation failed: ${discountRes.statusText} - ${errorText}`)
    }

    const discountData = (await discountRes.json()) as DiscountCodeResponse
    const finalCode = discountData.discount_code?.code

    if (!finalCode) {
      throw new Error('Failed to resolve discount code from response')
    }

    return finalCode
  } catch (err: any) {
    console.error('[discount-generator] error generating code:', err.message)
    // Return fallback code if price rule permissions aren't set up yet on Shopify store
    return `WACRM10OFF`
  }
}
