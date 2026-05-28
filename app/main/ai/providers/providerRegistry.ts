// Provider registry — presets and factory for AI providers

import type { AiProvider, AiProviderPreset } from '../types'
import { OpenAiResponsesProvider } from './OpenAiResponsesProvider'
import { ChatCompletionsProvider } from './ChatCompletionsProvider'

// ---- Preset Definitions ----

export const PROVIDER_PRESETS: AiProviderPreset[] = [
	{
		id: 'openai',
		label: 'OpenAI',
		kind: 'openai_responses',
		baseUrl: 'https://api.openai.com',
		defaultModel: 'gpt-4o',
		knownModels: ['gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-4o', 'gpt-4o-mini'],
		apiKeySetting: 'openAiApiKey',
		enabled: true,
		role: 'premium',
	},
	{
		id: 'deepseek-flash',
		label: 'DeepSeek Flash',
		kind: 'deepseek',
		baseUrl: 'https://api.deepseek.com',
		defaultModel: 'deepseek-v4-flash',
		knownModels: ['deepseek-v4-flash', 'deepseek-v3-flash'],
		apiKeySetting: 'aiDeepseekApiKey',
		enabled: true,
		role: 'cheap',
	},
	{
		id: 'deepseek-pro',
		label: 'DeepSeek Pro',
		kind: 'deepseek',
		baseUrl: 'https://api.deepseek.com',
		defaultModel: 'deepseek-v4-pro',
		knownModels: ['deepseek-v4-pro', 'deepseek-v3-pro'],
		apiKeySetting: 'aiDeepseekApiKey',
		enabled: true,
		role: 'premium',
	},
	{
		id: 'kimi',
		label: 'Kimi',
		kind: 'kimi',
		baseUrl: 'https://api.moonshot.ai/v1',
		defaultModel: 'kimi-k2.6',
		knownModels: ['kimi-k2.6', 'kimi-k2'],
		apiKeySetting: 'aiKimiApiKey',
		enabled: true,
		role: 'cheap',
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		kind: 'openrouter',
		baseUrl: 'https://openrouter.ai/api/v1',
		defaultModel: 'openai/gpt-4o',
		knownModels: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-sonnet-4'],
		apiKeySetting: 'aiOpenrouterApiKey',
		enabled: true,
		role: 'premium',
	},
	{
		id: 'custom',
		label: 'Custom',
		kind: 'custom_openai_compatible',
		baseUrl: '',
		defaultModel: '',
		knownModels: [],
		apiKeySetting: 'aiCustomApiKey',
		enabled: true,
		role: 'premium',
	},
	{
		id: 'local-llama-cpp',
		label: 'Local',
		kind: 'local_llama_cpp',
		baseUrl: 'http://127.0.0.1:8080/v1',
		defaultModel: 'local-qwen-coder',
		knownModels: ['local-qwen-coder', 'local-llama'],
		apiKeySetting: 'aiCustomApiKey',
		enabled: false,
		role: 'disabled',
	},
]

// ---- Catalog Builder ----

export interface ModelCatalogEntry {
	providerId: string
	providerLabel: string
	model: string
}

/** Build the available model list from enabled presets, merging user settings. */
export const build_model_catalog = (ai_settings: {
	aiCheapModel: string
	aiPremiumModel: string
	openAiModel: string
}): ModelCatalogEntry[] => {
	const seen = new Set<string>()
	const catalog: ModelCatalogEntry[] = []

	for (const preset of PROVIDER_PRESETS) {
		if (!preset.enabled) continue
		if (0 === preset.knownModels.length) continue

		for (const model of preset.knownModels) {
			const key = `${preset.id}:${model}`
			if (seen.has(key)) continue
			seen.add(key)
			catalog.push({ providerId: preset.id, providerLabel: preset.label, model })
		}
	}

	// Ensure user-configured models are present even if not in knownModels
	const ensure_model = (provider_id: string, provider_label: string, model: string) => {
		if (!model.trim()) return
		const key = `${provider_id}:${model}`
		if (seen.has(key)) return
		seen.add(key)
		catalog.push({ providerId: provider_id, providerLabel: provider_label, model })
	}

	ensure_model('openai', 'OpenAI', ai_settings.openAiModel)
	ensure_model('openai', 'OpenAI', ai_settings.aiPremiumModel)

	const cheap_preset = get_preset_by_id('deepseek-flash')
	ensure_model('deepseek-flash', cheap_preset?.label || 'DeepSeek Flash', ai_settings.aiCheapModel)

	return catalog
}


export const get_preset_by_id = (id: string): AiProviderPreset | undefined => {
	return PROVIDER_PRESETS.find((p) => p.id === id)
}

export const get_enabled_presets = (): AiProviderPreset[] => {
	return PROVIDER_PRESETS.filter((p) => p.enabled)
}

export const get_presets_by_role = (role: AiProviderPreset['role']): AiProviderPreset[] => {
	return PROVIDER_PRESETS.filter((p) => p.role === role && p.enabled)
}

// ---- Provider Factory ----

export interface ProviderFactoryInput {
	presetId: string
	model: string
	apiKeys: Record<string, string>
	customBaseUrl?: string
}

export const create_provider = (input: ProviderFactoryInput): AiProvider => {
	const preset = get_preset_by_id(input.presetId)
	if (!preset) {
		throw new Error(`Unknown provider preset: ${input.presetId}`)
	}

	if (!preset.enabled) {
		throw new Error(`Provider "${preset.label}" is not yet enabled.`)
	}

	const api_key = input.apiKeys[preset.apiKeySetting] || ''
	if (!api_key && 'openai_responses' !== preset.kind) {
		// For OpenAI, we also check env var in the caller
		if (!api_key && 'openai' !== preset.id) {
			throw new Error(`API key not configured for ${preset.label}. Set it in Settings.`)
		}
	}

	if ('openai_responses' === preset.kind) {
		return new OpenAiResponsesProvider(api_key, preset.baseUrl)
	}

	// All other providers use Chat Completions
	const base_url = 'custom' === preset.id ? (input.customBaseUrl || preset.baseUrl) : preset.baseUrl

	if (!base_url) {
		throw new Error(`Base URL not configured for ${preset.label}. Set it in Settings.`)
	}

	return new ChatCompletionsProvider(api_key, base_url, preset.id)
}
