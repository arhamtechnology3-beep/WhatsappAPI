import { describe, expect, it } from 'vitest'
import {
  buildCombinedReply,
  hasUsableContactName,
  isGreetingOnly,
  isProductInquiry,
  pickBestKnowledge,
  scoreKnowledgeMatch,
  type KnowledgeRow,
} from './product-inquiry'

const GAURANG_MSG = `We like to purchase your pickles,all other products which you make please send your complete list of iteams.will you be able to send  to mumbai at our residence. We will pay full payment + full delivery charges  whatever applicable.
Jai  shree krishna please suggest🌹🙏`

const CATALOG: KnowledgeRow = {
  id: '1',
  title: 'Full product catalog',
  answer: 'Here is our catalog link',
  keywords: ['pickle', 'product list', 'purchase', 'complete list'],
  pattern: '(buy|purchase).{0,40}(pickle|product)',
  status: 'active',
}

const MUMBAI: KnowledgeRow = {
  id: '2',
  title: 'Mumbai / India home delivery',
  answer: 'Yes we deliver to Mumbai',
  keywords: ['mumbai', 'delivery', 'residence'],
  pattern: 'mumbai.{0,30}(deliver|ship|send)',
  status: 'active',
}

const PAYMENT: KnowledgeRow = {
  id: '3',
  title: 'Payment + delivery charges',
  answer: 'Full payment + delivery charges ok',
  keywords: ['full payment', 'delivery charges'],
  pattern: 'full\\s*payment',
  status: 'active',
}

describe('isProductInquiry', () => {
  it('detects the Gaurang Vora pickle / Mumbai message', () => {
    expect(isProductInquiry(GAURANG_MSG)).toBe(true)
  })

  it('ignores greetings-only', () => {
    expect(isGreetingOnly('Namaste 🙏')).toBe(true)
    expect(isProductInquiry('Namaste 🙏')).toBe(false)
    expect(isProductInquiry('hi')).toBe(false)
  })

  it('detects short product asks', () => {
    expect(isProductInquiry('Please send pickle price list')).toBe(true)
    expect(isProductInquiry('Do you deliver to Mumbai?')).toBe(true)
  })
})

describe('knowledge matching', () => {
  it('scores catalog + mumbai + payment on the full inquiry', () => {
    expect(scoreKnowledgeMatch(GAURANG_MSG, CATALOG)).toBeGreaterThan(0)
    expect(scoreKnowledgeMatch(GAURANG_MSG, MUMBAI)).toBeGreaterThan(0)
    expect(scoreKnowledgeMatch(GAURANG_MSG, PAYMENT)).toBeGreaterThan(0)
  })

  it('picks a best row', () => {
    const best = pickBestKnowledge(GAURANG_MSG, [CATALOG, MUMBAI, PAYMENT])
    expect(best).not.toBeNull()
  })

  it('combines multiple facets into one reply', () => {
    const combined = buildCombinedReply(GAURANG_MSG, [CATALOG, MUMBAI, PAYMENT], {
      contactName: 'GAURANG VORA',
    })
    expect(combined).not.toBeNull()
    expect(combined!.matchedIds.length).toBeGreaterThanOrEqual(2)
    expect(combined!.answer).toContain('catalog')
    expect(combined!.answer).toContain('Mumbai')
    expect(combined!.answer).toMatch(/Namaste Gaurang|Jai Shree/i)
  })
})

describe('hasUsableContactName', () => {
  it('accepts WhatsApp profile names', () => {
    expect(hasUsableContactName('GAURANG VORA')).toBe(true)
  })

  it('rejects phone-looking placeholders', () => {
    expect(hasUsableContactName('918879554842')).toBe(false)
    expect(hasUsableContactName('')).toBe(false)
  })
})
