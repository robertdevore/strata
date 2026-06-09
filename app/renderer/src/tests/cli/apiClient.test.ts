import { afterEach, describe, expect, it, vi } from 'vitest'
import { StrataApiClient } from '../../../../cli/lib/apiClient'

describe('cli API client', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('normalizes base URL and sends auth headers when token exists', async () => {
		const fetch_mock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
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
		const body = JSON.parse((fetch_mock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>
		expect(body.content).toBe('# Title\n\nBody')
		expect(body.tags).toEqual(['cli'])
		expect('title' in body).toBe(false)
		expect('body' in body).toBe(false)
	})

	it('retries safe GET requests once on transient network failure', async () => {
		const fetch_mock = vi
			.fn()
			.mockRejectedValueOnce(new Error('network fail'))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
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
