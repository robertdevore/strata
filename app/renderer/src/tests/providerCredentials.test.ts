import { afterEach, expect, it, vi } from 'vitest'
import type { StrataDatabase } from '@main/db'
import { DEFAULT_AI_SETTINGS } from '@main/ai/types'
import { resolve_ai_settings } from '@main/ai/aiRunner'
import { create_provider } from '@main/ai/providers/providerRegistry'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
it('resolves OpenAI environment credentials without exposing or changing saved settings', async () => {
  vi.stubEnv('STRATA_OPENAI_API_KEY', '  synthetic-env-key  ')
  const settings = { ...DEFAULT_AI_SETTINGS, openAiApiKey: 'synthetic-vault-key' }
  const getSettings = vi.fn(() => settings)
  const db = { getSettings } as unknown as StrataDatabase
  const resolved = resolve_ai_settings(db)
  expect(resolved.openAiApiKey).toBe('synthetic-env-key')
  expect(getSettings).toHaveBeenCalledTimes(1)
  expect(settings.openAiApiKey).toBe('synthetic-vault-key')
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [] })))
  vi.stubGlobal('fetch', fetch)
  const provider = create_provider({
    presetId: 'openai',
    model: 'fixture',
    apiKeys: { openAiApiKey: resolved.openAiApiKey },
  })
  await provider.sendTurn({ model: 'fixture', systemPrompt: '', messages: [], tools: [] })
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-env-key')
  vi.stubEnv('STRATA_OPENAI_API_KEY', ' ')
  expect(resolve_ai_settings(db).openAiApiKey).toBe('synthetic-vault-key')
})
it('rejects absent credentials before connecting', () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  for (const presetId of ['openai', 'deepseek-flash', 'custom']) {
    expect(() =>
      create_provider({ presetId, model: 'fixture', apiKeys: {}, customBaseUrl: 'https://example.com' }),
    ).toThrow('API key not configured')
  }
  expect(fetch).not.toHaveBeenCalled()
})
