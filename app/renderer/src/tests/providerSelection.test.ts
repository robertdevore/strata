import { describe, expect, it } from 'vitest'
import { build_model_catalog, resolve_model_selection } from '@main/ai/providers/providerRegistry'

const settings = {
  aiCheapProvider: 'custom',
  aiCheapModel: 'my-deepseek-proxy',
  aiPremiumProvider: 'openrouter',
  aiPremiumModel: 'company/premium',
  openAiModel: 'gpt-4o',
  aiModelCatalog: '{}',
}
describe('explicit provider/model selection', () => {
  it('uses configured provider identities even when names contain other providers', () => {
    expect(resolve_model_selection(settings, 'my-deepseek-proxy').providerId).toBe('custom')
    expect(resolve_model_selection(settings, 'company/premium').providerId).toBe('openrouter')
    expect(build_model_catalog(settings)).not.toContainEqual(
      expect.objectContaining({ providerId: 'deepseek-flash', model: 'my-deepseek-proxy' }),
    )
  })
  it('requires a provider-qualified identity for ambiguous models', () => {
    const ambiguous = {
      ...settings,
      aiModelCatalog: JSON.stringify({ custom: 'shared', openrouter: 'shared' }),
    }
    expect(() => resolve_model_selection(ambiguous, 'shared')).toThrow('multiple providers')
    expect(resolve_model_selection(ambiguous, 'custom::shared')).toMatchObject({
      providerId: 'custom',
      model: 'shared',
    })
    expect(resolve_model_selection(ambiguous, 'openrouter::shared')).toMatchObject({
      providerId: 'openrouter',
      model: 'shared',
    })
  })
  it('rejects unregistered models and refreshes the catalog when provider settings change', () => {
    expect(() => resolve_model_selection(settings, 'unknown-deepseek-name')).toThrow(
      'not in the configured catalog',
    )
    const switched = { ...settings, aiCheapProvider: 'kimi' }
    expect(resolve_model_selection(switched, 'my-deepseek-proxy').providerId).toBe('kimi')
    expect(resolve_model_selection(settings, 'my-deepseek-proxy').providerId).toBe('custom')
  })
})
