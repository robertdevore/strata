import { afterEach, expect, it, vi } from 'vitest'
import { debugRuntime, runtimeErrorCode } from '@shared/runtimeLogging'
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
it('retains only allowlisted error codes and never serializes error data', () => {
  const secret = 'secret-note-key-filepath'
  expect(runtimeErrorCode(Object.assign(new Error(secret), { code: 'EACCES', body: secret }))).toBe('EACCES')
  expect(runtimeErrorCode({ code: secret, message: secret, stack: secret })).toBe('UNEXPECTED_ERROR')
  expect(runtimeErrorCode(secret)).toBe('UNEXPECTED_ERROR')
  expect(
    runtimeErrorCode({
      get code() {
        throw new Error(secret)
      },
    }),
  ).toBe('UNEXPECTED_ERROR')
})
it('keeps startup checkpoints quiet unless debug is explicitly enabled', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.stubEnv('STRATA_DEBUG', '')
  debugRuntime('startup checkpoint')
  expect(log).not.toHaveBeenCalled()
  vi.stubEnv('STRATA_DEBUG', '1')
  debugRuntime('startup checkpoint')
  expect(log).toHaveBeenCalledWith('startup checkpoint')
})
it('omits URLs, queries and credentials from CLI request diagnostics', async () => {
  const { StrataApiClient } = await import('../../../cli/lib/apiClient')
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
  const client = new StrataApiClient({
    baseUrl: 'http://127.0.0.1:3939',
    token: 'private-token-fixture',
    timeoutMs: 1000,
    verbose: true,
  })
  await client.request('GET', '/search', { query: { query: 'private-note-query-fixture' } })
  expect(fetchSpy).toHaveBeenCalledOnce()
  const logged = write.mock.calls.flat().join('')
  expect(logged).toContain('GET request')
  expect(logged).not.toContain('private-')
  expect(logged).not.toContain('/search')
})
