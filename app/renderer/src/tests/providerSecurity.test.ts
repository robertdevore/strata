import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestProviderJson, validateProviderUrl } from '@main/ai/providerRequest'
import { MAX_AUDIO_BYTES, transcriptionSchema } from '@main/ai/transcriptionInput'
afterEach(() => vi.unstubAllGlobals())
describe('provider boundaries', () => {
  it('validates endpoints and rejects metadata, credentials and unsafe protocols', () => {
    for (const url of [
      'file:///tmp/a',
      'http://example.com',
      'https://u:secret@example.com',
      'https://169.254.169.254/latest',
      'https://example.com?secret=key',
    ])
      expect(() => validateProviderUrl(url)).toThrow()
    expect(validateProviderUrl('http://127.0.0.1:8080/v1')).toBe('http://127.0.0.1:8080/v1')
  })
  it('times out stalled requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
          ),
      ),
    )
    await expect(requestProviderJson('https://example.com', {}, 10)).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
  })
  it('redacts upstream errors and disables redirects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('secret provider details', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(requestProviderJson('https://example.com', {})).rejects.toMatchObject({
      code: 'AUTH_ERROR',
      message: 'Provider request failed (401)',
    })
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error')
  })
  it('rejects invalid response JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{bad')))
    await expect(requestProviderJson('https://example.com', {})).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
  it('bounds audio before decoding and checks MIME and language', () => {
    expect(transcriptionSchema.safeParse({ base64Audio: 'aGVsbG8=', mimeType: 'audio/webm' }).success).toBe(
      true,
    )
    expect(
      transcriptionSchema.safeParse({
        base64Audio: 'a'.repeat(Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 4),
        mimeType: 'audio/webm',
      }).success,
    ).toBe(false)
    expect(transcriptionSchema.safeParse({ base64Audio: '%%%%', mimeType: 'audio/webm' }).success).toBe(false)
    expect(
      transcriptionSchema.safeParse({ base64Audio: 'aGVsbG8=', mimeType: 'text/html', language: 'anything' })
        .success,
    ).toBe(false)
  })
})
