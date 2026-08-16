import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./meta-api', () => ({
  uploadResumableMedia: vi.fn(async () => ({ handle: 'HANDLE123' })),
  resolveMetaAppIdForToken: vi.fn(async () => 'app-from-token'),
  explainUnsupportedMetaObjectError: (m: string) => m,
}));

import { ensureImageHeaderHandle } from './template-header-handle';
import {
  uploadResumableMedia,
  resolveMetaAppIdForToken,
} from './meta-api';
import type { TemplatePayload } from './template-validators';

function payload(over: Partial<TemplatePayload> = {}): TemplatePayload {
  return {
    name: 't',
    category: 'Utility',
    language: 'en_US',
    body_text: 'hi',
    header_type: 'image',
    header_media_url: 'https://x.test/img.jpg',
    ...over,
  };
}

function imgResponse(type = 'image/jpeg', size = 1024, ok = true, status = 200): Response {
  return {
    ok,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? type : null) },
    arrayBuffer: async () => new ArrayBuffer(size),
  } as unknown as Response;
}

describe('ensureImageHeaderHandle', () => {
  beforeEach(() => {
    vi.mocked(uploadResumableMedia).mockClear();
    vi.mocked(resolveMetaAppIdForToken).mockClear();
    vi.mocked(resolveMetaAppIdForToken).mockResolvedValue('app-from-token');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op for non-image headers', async () => {
    const p = payload({ header_type: 'text', header_content: 'Hi' });
    await ensureImageHeaderHandle(p, 'tok');
    expect(uploadResumableMedia).not.toHaveBeenCalled();
    expect(p.header_handle).toBeUndefined();
  });

  it('is a no-op when a handle already exists', async () => {
    const p = payload({ header_handle: 'existing' });
    await ensureImageHeaderHandle(p, 'tok');
    expect(uploadResumableMedia).not.toHaveBeenCalled();
    expect(p.header_handle).toBe('existing');
  });

  it('derives + sets header_handle using the token App ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imgResponse('image/jpeg', 2048)));
    const p = payload();
    await ensureImageHeaderHandle(p, 'tok');
    expect(resolveMetaAppIdForToken).toHaveBeenCalledWith('tok');
    expect(uploadResumableMedia).toHaveBeenCalledOnce();
    expect(vi.mocked(uploadResumableMedia).mock.calls[0][0].appId).toBe(
      'app-from-token',
    );
    expect(p.header_handle).toBe('HANDLE123');
  });

  it('rejects a non-image content type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imgResponse('text/html')));
    await expect(ensureImageHeaderHandle(payload(), 'tok')).rejects.toThrow(/JPEG or PNG/);
  });

  it('rejects an image over 5 MB', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imgResponse('image/png', 6 * 1024 * 1024)));
    await expect(ensureImageHeaderHandle(payload(), 'tok')).rejects.toThrow(/5 MB/);
  });
});
