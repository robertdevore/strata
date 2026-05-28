// Strata AI — provider-agnostic types
// Normalized provider interface for all AI backends

export interface AiToolDefinition {
	type: 'function'
	name: string
	description: string
	parameters: {
		type: 'object'
		properties: Record<string, unknown>
		required?: string[]
	}
}

export interface AiProviderTurnInput {
	model: string
	systemPrompt: string
	messages: Array<{
		role: 'system' | 'user' | 'assistant'
		content: string
	}>
	tools: AiToolDefinition[]
	temperature?: number
}

export interface NormalizedToolCall {
	id: string
	name: string
	argumentsJson: string
}

export interface AiProviderTurnOutput {
	content: string
	toolCalls: NormalizedToolCall[]
	raw?: unknown
	usage?: {
		inputTokens?: number
		outputTokens?: number
		totalTokens?: number
	}
}

export interface AiProvider {
	readonly providerId: string
	readonly kind: AiProviderKind
	sendTurn(input: AiProviderTurnInput): Promise<AiProviderTurnOutput>
}

export type AiProviderKind =
	| 'openai_responses'
	| 'openai_chat_completions'
	| 'deepseek'
	| 'kimi'
	| 'openrouter'
	| 'custom_openai_compatible'
	| 'local_llama_cpp'

export type AiRoutingMode =
	| 'premium_only'
	| 'cheap_only'
	| 'auto'
	| 'ask_each_time'

export type AiIntent =
	| 'create_note'
	| 'update_note'
	| 'search_notes'
	| 'summarize_note'
	| 'extract_tasks'
	| 'tag_note'
	| 'rewrite_search'
	| 'complex_reasoning'
	| 'code_architecture'
	| 'unknown'

export type AiRouteTarget = 'cheap' | 'premium' | 'blocked'

export type AiRiskLevel = 'low' | 'medium' | 'high'

export interface AiRouteDecision {
	route: AiRouteTarget
	intent: AiIntent
	confidence: number
	risk: AiRiskLevel
	requiresConfirmation: boolean
	reason: string
}

export interface AiRouteLog {
	id: string
	threadId: string | null
	userMessage: string
	intent: AiIntent
	route: AiRouteTarget
	providerId: string
	model: string
	confidence: number | null
	risk: AiRiskLevel | null
	requiresConfirmation: boolean
	reason: string | null
	fallbackUsed: boolean
	fallbackReason: string | null
	inputTokens: number | null
	outputTokens: number | null
	createdAt: string
}

export interface AiProviderPreset {
	id: string
	label: string
	kind: AiProviderKind
	baseUrl: string
	defaultModel: string
	knownModels: string[]
	apiKeySetting: keyof AiSettings
	enabled: boolean
	role: 'cheap' | 'premium' | 'disabled'
}

// Extended settings for AI provider configuration
export interface AiSettings {
	// Existing fields (preserved)
	openAiApiKey: string
	openAiModel: string

	// Routing
	aiRoutingMode: AiRoutingMode

	// Cheap provider
	aiCheapProvider: string    // preset id: 'deepseek-flash' | 'kimi' | 'openrouter' | 'custom'
	aiCheapModel: string        // editable model id

	// Premium provider
	aiPremiumProvider: string   // preset id: 'openai' | 'openrouter' | 'custom'
	aiPremiumModel: string      // editable model id

	// API keys
	aiDeepseekApiKey: string
	aiKimiApiKey: string
	aiOpenrouterApiKey: string
	aiCustomApiKey: string

	// Custom provider
	aiCustomBaseUrl: string

	// Display options
	aiShowRoutingDecisions: boolean
	aiEnableRouteLogs: boolean

	// Thresholds
	aiCheapConfidenceThreshold: number
	aiPremiumFallbackThreshold: number

	// Model catalog — user-configured per-provider models
	aiModelCatalog: string
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
	openAiApiKey: '',
	openAiModel: 'gpt-4o',
	aiRoutingMode: 'auto',
	aiCheapProvider: 'deepseek-flash',
	aiCheapModel: 'deepseek-v4-flash',
	aiPremiumProvider: 'openai',
	aiPremiumModel: 'gpt-4o',
	aiDeepseekApiKey: '',
	aiKimiApiKey: '',
	aiOpenrouterApiKey: '',
	aiCustomApiKey: '',
	aiCustomBaseUrl: '',
	aiShowRoutingDecisions: true,
	aiEnableRouteLogs: true,
	aiCheapConfidenceThreshold: 0.85,
	aiPremiumFallbackThreshold: 0.65,
	aiModelCatalog: '[]',
}
