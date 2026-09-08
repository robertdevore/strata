import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { StrataApiClient } from '../../../../cli/lib/apiClient'

describe('cli API client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('normalizes base URL and sends auth headers when token exists', async () => {
    const fetch_mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetch_mock)

    const client = new StrataApiClient({
      baseUrl: 'http://127.0.0.1:3939/',
      token: 'abc123',
      timeoutMs: 1000,
    })

    await client.health()
    expect(fetch_mock).toHaveBeenCalledTimes(1)
    const call = fetch_mock.mock.calls[0]
    expect(call[0]).toBe('http://127.0.0.1:3939/health')
    const headers = (call[1] as RequestInit).headers as Headers
    expect(headers.get('X-Strata-Token')).toBe('abc123')
    expect(headers.get('Authorization')).toBe('Bearer abc123')
  })

  it('sends content payload for note creation (no title/body fields)', async () => {
    const fetch_mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          note: {
            id: '00000000-0000-0000-0000-000000000000',
            content: '# Title\\n\\nBody',
            revision: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            starred: false,
            archived: false,
            tags: ['cli'],
            projectId: null,
            deletedAt: null,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetch_mock)

    const client = new StrataApiClient({
      baseUrl: 'http://127.0.0.1:3939',
      token: null,
      timeoutMs: 1000,
    })

    await client.createNote({ content: '# Title\n\nBody', tags: ['cli'] })
    const body = JSON.parse((fetch_mock.mock.calls[0][1] as RequestInit).body as string) as Record<
      string,
      unknown
    >
    expect(body.content).toBe('# Title\n\nBody')
    expect(body.tags).toEqual(['cli'])
    expect('title' in body).toBe(false)
    expect('body' in body).toBe(false)
  })

  it('preserves the callers revision without a refresh or mutation retry', async () => {
    const fetch_mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'REVISION_CONFLICT', message: 'stale revision', details: { actual: 9 } },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetch_mock)
    const client = new StrataApiClient({ baseUrl: 'http://127.0.0.1:3939', token: 'test', timeoutMs: 1000 })
    await expect(
      client.updateNote('00000000-0000-0000-0000-000000000000', { content: 'draft', expectedRevision: 5 }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', exitCode: 6 })
    expect(fetch_mock).toHaveBeenCalledTimes(1)
    expect(fetch_mock.mock.calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(fetch_mock.mock.calls[0][1].body)).toMatchObject({
      expectedRevision: 5,
      content: 'draft',
    })
  })

  it('retries safe GET requests once on transient network failure', async () => {
    const fetch_mock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network fail'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetch_mock)

    const client = new StrataApiClient({
      baseUrl: 'http://127.0.0.1:3939',
      token: null,
      timeoutMs: 2000,
    })

    const result = await client.health()
    expect(result.ok).toBe(true)
    expect(fetch_mock).toHaveBeenCalledTimes(2)
  })
})

it.each(['not JSON', '{"wrong":"shape"}'])(
  'reports malformed successful responses without retrying: %s',
  async (body) => {
    const fetch = vi.fn(async () => new Response(body))
    vi.stubGlobal('fetch', fetch)
    try {
      const client = new StrataApiClient({ baseUrl: 'http://127.0.0.1:3939', token: null, timeoutMs: 1000 })
      await expect(client.health()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
      expect(fetch).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  },
)

it.each([true, false])('bounds API response bytes with or without Content-Length: %s', async (header) => {
  const response = new Response(new Uint8Array(4 * 1024 * 1024 + 1), {
    headers: header ? { 'Content-Length': String(4 * 1024 * 1024 + 1) } : {},
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  )
  try {
    const client = new StrataApiClient({ baseUrl: 'http://127.0.0.1:3939', token: null, timeoutMs: 1000 })
    await expect(client.health()).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
  } finally {
    vi.unstubAllGlobals()
  }
})

it('clears retry timers after a transient HTTP failure succeeds', async () => {
  vi.useFakeTimers()
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(new Response('{"ok":true}'))
  vi.stubGlobal('fetch', fetch)
  try {
    const client = new StrataApiClient({ baseUrl: 'http://127.0.0.1:3939', token: null, timeoutMs: 1000 })
    const result = client.health()
    await vi.advanceTimersByTimeAsync(121)
    await expect(result).resolves.toEqual({ ok: true })
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})

it('preserves timeout classification when the server stalls after sending headers', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.write('{')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address() as { port: number }
    const client = new StrataApiClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      token: null,
      timeoutMs: 50,
    })
    await expect(client.health()).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', exitCode: 8 })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

it.each(['revision', 'content'])(
  'rejects a full note missing %s instead of inventing write prerequisites',
  async (missing) => {
    const note = {
      id: '00000000-0000-4000-8000-000000000001',
      content: '# Original',
      revision: 2,
      createdAt: '2026-09-08T00:00:00Z',
      updatedAt: '2026-09-08T00:00:00Z',
      starred: false,
      archived: false,
      tags: [],
      projectId: null,
      deletedAt: null,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              note: Object.fromEntries(Object.entries(note).filter(([key]) => key !== missing)),
            }),
          ),
      ),
    )
    try {
      const client = new StrataApiClient({ baseUrl: 'http://127.0.0.1:3939', token: null, timeoutMs: 1000 })
      await expect(client.getNote(note.id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    } finally {
      vi.unstubAllGlobals()
    }
  },
)
