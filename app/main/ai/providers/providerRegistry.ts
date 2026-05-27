// Provider registry — presets and factory for AI providers

import type { AiProvider, AiProviderPreset } from '../types'
import { OpenAiResponsesProvider } from './OpenAiResponsesProvider'
import { ChatCompletionsProvider } from './ChatCompletionsProvider'

// ---- Preset Definitions ----

export const PROVIDER_PRESETS: AiProviderPreset[] = [
	{
		id: 'openai',
		label: 'OpenAI (Responses API)',
		kind: 'openai_responses',
		baseUrl: 'https://api.openai.com',
		defaultModel: 'gpt-4o',
		apiKeySetting: 'openAiApiKey',
		enabled: true,
		role: 'premium',
	},
	{
		id: 'deepseek-flash',
		label: 'DeepSeek V4 Flash',
		kind: 'deepseek',
		baseUrl: 'https://api.deepseek.com',
		defaultModel: 'deepseek-v4-flash',
		apiKeySetting: 'aiDeepseekApiKey',
		enabled: true,
		role: 'cheap',
	},
	{
		id: 'deepseek-pro',
		label: 'DeepSeek V4 Pro',
		kind: 'deepseek',
		baseUrl: 'https://api.deepseek.com',
		defaultModel: 'deepseek-v4-pro',
		apiKeySetting: 'aiDeepseekApiKey',
		enabled: true,
		role: 'premium',
	},
	{
		id: 'kimi',
		label: 'Kimi / Moonshot',
		kind: 'kimi',
		baseUrl: 'https://api.moonshot.ai/v1',
		defaultModel: 'kimi-k2.6',
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
		apiKeySetting: 'aiOpenrouterApiKey',
		enabled: true,
		role: 'premium',
	},
	{
		id: 'custom',
		label: 'Custom OpenAI-compatible',
		kind: 'custom_openai_compatible',
		baseUrl: '',
		defaultModel: '',
		apiKeySetting: 'aiCustomApiKey',
		enabled: true,
		role: 'premium',
	},
	{
		id: 'local-llama-cpp',
		label: 'Local llama.cpp (future)',
		kind: 'local_llama_cpp',
		baseUrl: 'http://127.0.0.1:8080/v1',
		defaultModel: 'local-qwen-coder',
		apiKeySetting: 'aiCustomApiKey',
		enabled: false,  // disabled for now
		role: 'disabled',
	},
]

// ---- Lookup Helpers ----

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
