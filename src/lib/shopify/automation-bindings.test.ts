import { describe, expect, it } from 'vitest'
import { recipeByName } from './whatsapp-template-library'
import {
  SHOPIFY_RULE_BINDINGS,
  SHOPIFY_SEQUENCE_BINDINGS,
  approvalFromTemplateStatus,
  sequenceStepSendDecision,
} from './automation-bindings'

describe('automation bindings', () => {
  it('points every Shopify trigger at a live recipe name', () => {
    for (const binding of SHOPIFY_RULE_BINDINGS) {
      expect(recipeByName(binding.templateName)?.template_name).toBe(binding.templateName)
    }
    for (const seq of SHOPIFY_SEQUENCE_BINDINGS) {
      for (const step of seq.steps) {
        expect(recipeByName(step.templateName)?.template_name).toBe(step.templateName)
      }
    }
  })

  it('maps Meta template status onto automation approval', () => {
    expect(approvalFromTemplateStatus('APPROVED')).toBe('approved')
    expect(approvalFromTemplateStatus('PENDING')).toBe('pending')
    expect(approvalFromTemplateStatus('REJECTED')).toBe('rejected')
    expect(approvalFromTemplateStatus('DRAFT')).toBe('not_submitted')
  })

  it('waits on pending drip steps instead of skipping them', () => {
    expect(sequenceStepSendDecision(null)).toBe('skip')
    expect(
      sequenceStepSendDecision({ is_active: true, meta_approval_status: 'pending' }),
    ).toBe('wait')
    expect(
      sequenceStepSendDecision({ is_active: true, meta_approval_status: 'approved' }),
    ).toBe('send')
  })
})
