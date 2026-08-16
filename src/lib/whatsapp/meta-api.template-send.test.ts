import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageTemplate } from '@/types'

const posted: Array<{ url: string; body: unknown }> = []

function jsonRes(ok: boolean, payload: unknown, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response
}

describe('sendTemplateMessage retries', () => {
  beforeEach(() => {
    posted.length = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url)
        if (u.includes('/media') && !u.includes('/messages')) {
          return jsonRes(true, { id: 'MEDIA123' })
        }
        if (u.includes('/messages')) {
          const body = init?.body ? JSON.parse(init.body as string) : null
          posted.push({ url: u, body })
          const components = body?.template?.components as
            | Array<{ type: string }>
            | undefined
          const hasHeader = components?.some((c) => c.type === 'header')
          if (hasHeader) {
            return jsonRes(
              false,
              {
                error: {
                  message: 'Invalid parameter',
                  code: 100,
                  error_data: { details: 'header image' },
                },
              },
              400,
            )
          }
          return jsonRes(true, { messages: [{ id: 'wamid.OK' }] })
        }
        return jsonRes(true, {})
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retries without the IMAGE header when Meta rejects it', async () => {
    const { sendTemplateMessage } = await import('./meta-api')
    const template: MessageTemplate = {
      id: '1',
      user_id: 'u',
      name: 'wacrm_festival_broadcast_v2',
      category: 'Marketing',
      language: 'EN_US',
      header_type: 'image',
      header_media_url: 'https://example.com/h.png',
      body_text: 'Namaste {{1}}!',
      created_at: '2026-01-01T00:00:00Z',
    }

    const result = await sendTemplateMessage({
      phoneNumberId: 'PN',
      accessToken: 'tok',
      to: '919769104020',
      templateName: template.name,
      language: 'EN_US',
      template,
      messageParams: { body: ['Jesal'], headerMediaUrl: template.header_media_url },
    })

    expect(result.messageId).toBe('wamid.OK')
    expect(posted.length).toBeGreaterThan(1)
    const last = posted[posted.length - 1]?.body as {
      template: { language: { code: string }; components: Array<{ type: string }> }
    }
    expect(last.template.language.code).toBe('en_US')
    expect(last.template.components.some((c) => c.type === 'header')).toBe(false)
  })
})
