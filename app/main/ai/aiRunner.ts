// Strata AI Runner — orchestrates provider selection, routing, tool loop, and linkification
// This replaces the core of aiHandlers.ts with a provider-agnostic implementation.

import type { StrataDatabase } from '../db/index'
import type { AiThread } from '../../shared/types'
import type {
	AiProvider,
	AiProviderTurnInput,
	AiProviderTurnOutput,
	AiRouteLog,
	AiRoutingMode,
	AiSettings,
} from './types'
import { AI_TOOLS, execute_tool_call } from './tools'
import type { ToolExecutionContext } from './tools'
import { route_ai_request } from './routing'
import type { RouterConfig } from './routing'
import { create_provider } from './providers/providerRegistry'

// ---- System Prompt ----

const SYSTEM_PROMPT = [
	'You are Strata AI, an assistant embedded in a local notes app.',
	'Use available tools to search notes/chats before making claims, especially for analytical requests.',
	'You may create and edit any note when the user asks. Never delete notes.',
	'Use note tools as your built-in note CLI path: list_notes, search_notes, get_note, get_note_by_title, update_note, and update_note_by_title.',
	'When a user asks to edit a note title they mention (for example TODO NOW), resolve it by title and then apply the update in the same turn.',
	'Never claim a note was updated unless a tool call actually changed a note. If no note changed, say that clearly.',
	'If you create or edit notes, tell the user which notes changed using markdown links in the format [Note title](#strata-note:note_id).',
	'When referencing notes, prefer note titles with #strata-note: links instead of raw note IDs.',
	'Thread IDs may be plain text when needed.',
].join(' ')

// ---- Helpers ----

const note_id_pattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

const derive_note_title = (content: string): string => {
	const lines = content.split(/\r?\n/)
	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed) continue
		const unprefixed = trimmed.replace(/^#+\s*/, '').trim()
		if (unprefixed) return unprefixed.length <= 80 ? unprefixed : `${unprefixed.slice(0, 77)}...`
	}
	return 'Untitled'
}

const derive_chat_title = (message: string): string => {
	const first_line = message
		.split('\n')
		.map((line) => line.trim())
		.find((line) => line.length > 0)
	if (!first_line) return 'New chat'
	return first_line.length <= 64 ? first_line : `${first_line.slice(0, 61)}...`
}

const user_requested_note_edit = (user_message: string): boolean => {
	const lower = user_message.toLowerCase()
	const has_action = /\b(update|edit|rewrite|change|modify|insert|add|append|prepend|move|reorder|renumber|fix|patch|apply)\b/i.test(lower)
	const has_note_target = /\b(note|notes|markdown|todo|list|section|callout|content|document)\b/i.test(lower)
	const has_wiki_link = /\[\[[^\]]+\]\]/.test(user_message)
	return (has_action && has_note_target) || has_wiki_link
}

const assistant_claims_note_edit_success = (content: string): boolean => {
	const lower = content.toLowerCase()
	const has_success_claim = /\b(done|updated|edited|inserted|added|applied|patched|rewrote|reordered|renumbered|created)\b/i.test(lower)
	const has_note_scope = /\b(note|notes|markdown|todo|list|section|callout|content)\b/i.test(lower)
	return has_success_claim && has_note_scope
}

const enforce_note_edit_truthfulness = (
	content: string,
	notes_changed: boolean,
): string => {
	if (!content || notes_changed) return content

	if (!assistant_claims_note_edit_success(content)) {
		return content
	}

	return [
		'I did not apply any note edits in this step.',
		'No note content was changed.',
		'Provide the exact note title or a note link like [Title](#strata-note:note_id), and I will apply the edit and confirm exactly what changed.',
	].join('\n\n')
}

/** Convert raw note IDs in AI response text to #strata-note: links */
const linkify_note_ids = (db: StrataDatabase, content: string): string => {
	if (!content) return ''
	const note_title_cache: Record<string, string | null> = {}

	return content.replace(note_id_pattern, (raw: string, offset: number, source: string) => {
		// Don't linkify IDs that are already inside a strata link
		const prefix = source.slice(Math.max(0, offset - 14), offset).toLowerCase()
		if (prefix.includes('strata-note:')) return raw

		const note_id = raw.toLowerCase()
		if (!(note_id in note_title_cache)) {
			const note = db.aiGetNoteById(note_id)
			note_title_cache[note_id] = note ? derive_note_title(note.content) : null
		}

		const note_title = note_title_cache[note_id]
		if (!note_title) return raw

		return `[${note_title}](#strata-note:${note_id})`
	})
}

// ---- AI Settings helpers ----

const resolve_api_key = (db: StrataDatabase, key_field: keyof AiSettings): string => {
	const settings = db.getSettings() as unknown as Record<string, unknown>
	const from_env = process.env.STRATA_OPENAI_API_KEY?.trim()

	if ('openAiApiKey' === key_field && from_env) return from_env

	const from_settings = 'string' === typeof settings[String(key_field)] ? (settings[String(key_field)] as string).trim() : ''
	if (from_settings) return from_settings

	return ''
}

const resolve_ai_settings = (db: StrataDatabase): AiSettings => {
	const raw = db.getSettings() as unknown as Record<string, unknown>
	return {
		openAiApiKey: 'string' === typeof raw.openAiApiKey ? raw.openAiApiKey as string : '',
		openAiModel: 'string' === typeof raw.openAiModel ? raw.openAiModel as string : 'gpt-4o',
		aiRoutingMode: ('string' === typeof raw.aiRoutingMode ? raw.aiRoutingMode : 'auto') as AiRoutingMode,
		aiCheapProvider: 'string' === typeof raw.aiCheapProvider ? raw.aiCheapProvider as string : 'deepseek-flash',
		aiCheapModel: 'string' === typeof raw.aiCheapModel ? raw.aiCheapModel as string : 'deepseek-v4-flash',
		aiPremiumProvider: 'string' === typeof raw.aiPremiumProvider ? raw.aiPremiumProvider as string : 'openai',
		aiPremiumModel: 'string' === typeof raw.aiPremiumModel ? raw.aiPremiumModel as string : 'gpt-4o',
		aiDeepseekApiKey: 'string' === typeof raw.aiDeepseekApiKey ? raw.aiDeepseekApiKey as string : '',
		aiKimiApiKey: 'string' === typeof raw.aiKimiApiKey ? raw.aiKimiApiKey as string : '',
		aiOpenrouterApiKey: 'string' === typeof raw.aiOpenrouterApiKey ? raw.aiOpenrouterApiKey as string : '',
		aiCustomApiKey: 'string' === typeof raw.aiCustomApiKey ? raw.aiCustomApiKey as string : '',
		aiCustomBaseUrl: 'string' === typeof raw.aiCustomBaseUrl ? raw.aiCustomBaseUrl as string : '',
		aiShowRoutingDecisions: 'boolean' === typeof raw.aiShowRoutingDecisions ? raw.aiShowRoutingDecisions as boolean : true,
		aiEnableRouteLogs: 'boolean' === typeof raw.aiEnableRouteLogs ? raw.aiEnableRouteLogs as boolean : true,
		aiCheapConfidenceThreshold: 'number' === typeof raw.aiCheapConfidenceThreshold ? raw.aiCheapConfidenceThreshold as number : 0.85,
		aiPremiumFallbackThreshold: 'number' === typeof raw.aiPremiumFallbackThreshold ? raw.aiPremiumFallbackThreshold as number : 0.65,
		aiModelCatalog: 'string' === typeof raw.aiModelCatalog ? raw.aiModelCatalog as string : '{}',
	}
}

const build_api_keys_map = (ai_settings: AiSettings): Record<string, string> => {
	return {
		openAiApiKey: ai_settings.openAiApiKey,
		aiDeepseekApiKey: ai_settings.aiDeepseekApiKey,
		aiKimiApiKey: ai_settings.aiKimiApiKey,
		aiOpenrouterApiKey: ai_settings.aiOpenrouterApiKey,
		aiCustomApiKey: ai_settings.aiCustomApiKey,
	}
}

// ---- Provider resolution ----

const resolve_provider_for_route = (
	db: StrataDatabase,
	route_target: 'cheap' | 'premium',
): { provider: AiProvider; model: string; provider_id: string } => {
	const ai_settings = resolve_ai_settings(db)
	const api_keys = build_api_keys_map(ai_settings)

	if ('cheap' === route_target) {
		const preset_id = ai_settings.aiCheapProvider || 'deepseek-flash'
		const model = ai_settings.aiCheapModel || 'deepseek-v4-flash'
		const provider = create_provider({ presetId: preset_id, model, apiKeys: api_keys, customBaseUrl: ai_settings.aiCustomBaseUrl })
		return { provider, model, provider_id: preset_id }
	}

	// Premium
	const preset_id = ai_settings.aiPremiumProvider || 'openai'
	const model = ai_settings.aiPremiumModel || 'gpt-4o'
	const provider = create_provider({ presetId: preset_id, model, apiKeys: api_keys, customBaseUrl: ai_settings.aiCustomBaseUrl })
	return { provider, model, provider_id: preset_id }
}

type ResolvedProvider = {
	provider: AiProvider
	model: string
	provider_id: string
	route_target?: 'cheap' | 'premium'
}

// ---- Route logging ----

const log_route = (
	db: StrataDatabase,
	log: Omit<AiRouteLog, 'id' | 'createdAt'>,
): void => {
	try {
		db.recordRouteLog(log)
	} catch {
		// Route logging is best-effort — don't fail the request
	}
}

const accumulate_usage_value = (current: number | null, next: number | null | undefined): number | null => {
	if ('number' !== typeof next) return current
	return (current ?? 0) + next
}

// ---- Main AI Runner ----

export interface AiRunnerResult {
	content: string
	notesChanged: boolean
	routeLog: AiRouteLog | null
}

interface AiRunnerOptions {
	openNotesContext?: string
	forcedModel?: string
}

const build_system_prompt = (open_notes_context?: string): string => {
	if (!open_notes_context) return SYSTEM_PROMPT
	return `${SYSTEM_PROMPT}\n\n${open_notes_context}`
}

const resolve_provider_for_forced_model = (
	db: StrataDatabase,
	forced_model: string,
): { provider: AiProvider; model: string; provider_id: string; route_target: 'cheap' | 'premium' } => {
	const ai_settings = resolve_ai_settings(db)
	const normalized_model = forced_model.trim().toLowerCase()

	if (!normalized_model) {
		return {
			...resolve_provider_for_route(db, 'premium'),
			route_target: 'premium',
		}
	}

	if (normalized_model === ai_settings.aiCheapModel.trim().toLowerCase()) {
		const resolved = resolve_provider_for_route(db, 'cheap')
		return {
			provider: resolved.provider,
			model: forced_model,
			provider_id: resolved.provider_id,
			route_target: 'cheap',
		}
	}

	if (
		normalized_model === ai_settings.aiPremiumModel.trim().toLowerCase() ||
		normalized_model === ai_settings.openAiModel.trim().toLowerCase()
	) {
		const resolved = resolve_provider_for_route(db, 'premium')
		return {
			provider: resolved.provider,
			model: forced_model,
			provider_id: resolved.provider_id,
			route_target: 'premium',
		}
	}

	if (/deepseek/i.test(forced_model)) {
		const provider = create_provider({
			presetId: 'deepseek-flash',
			model: forced_model,
			apiKeys: build_api_keys_map(ai_settings),
			customBaseUrl: ai_settings.aiCustomBaseUrl,
		})
		return { provider, model: forced_model, provider_id: 'deepseek-flash', route_target: 'cheap' }
	}

	if (/kimi|moonshot/i.test(forced_model)) {
		const provider = create_provider({
			presetId: 'kimi',
			model: forced_model,
			apiKeys: build_api_keys_map(ai_settings),
			customBaseUrl: ai_settings.aiCustomBaseUrl,
		})
		return { provider, model: forced_model, provider_id: 'kimi', route_target: 'cheap' }
	}

	const premium_resolved = resolve_provider_for_route(db, 'premium')
	const provider = create_provider({
		presetId: premium_resolved.provider_id,
		model: forced_model,
		apiKeys: build_api_keys_map(ai_settings),
		customBaseUrl: ai_settings.aiCustomBaseUrl,
	})

	return {
		provider,
		model: forced_model,
		provider_id: premium_resolved.provider_id,
		route_target: 'premium',
	}
}

export const run_ai_turn = async (db: StrataDatabase, thread: AiThread, options?: AiRunnerOptions): Promise<AiRunnerResult> => {
	const ai_settings = resolve_ai_settings(db)
	const history = db.listAiMessages(thread.id).slice(-40)
	const last_user = history.filter((m) => 'user' === m.role).pop()
	const user_message = last_user?.content || ''
	const user_messages = history.filter((m) => 'user' === m.role).map((m) => m.content || '')
	const note_edit_requested_recently = user_messages.slice(-6).some((value) => user_requested_note_edit(value))
	const system_prompt = build_system_prompt(options?.openNotesContext)

	// 1. Route the request
	const route_config: RouterConfig = {
		mode: ai_settings.aiRoutingMode,
		cheapConfidenceThreshold: ai_settings.aiCheapConfidenceThreshold,
		premiumFallbackThreshold: ai_settings.aiPremiumFallbackThreshold,
	}
	const decision = route_ai_request(user_message, route_config)

	const route_log: AiRouteLog = {
		id: '',
		threadId: thread.id,
		userMessage: user_message.slice(0, 500),
		intent: decision.intent,
		route: decision.route,
		providerId: '',
		model: '',
		confidence: decision.confidence,
		risk: decision.risk,
		requiresConfirmation: decision.requiresConfirmation,
		reason: decision.reason,
		fallbackUsed: false,
		fallbackReason: null,
		inputTokens: null,
		outputTokens: null,
		createdAt: new Date().toISOString(),
	}

	// Blocked requests
	if ('blocked' === decision.route) {
		route_log.providerId = 'blocked'
		route_log.model = 'none'
		if (ai_settings.aiEnableRouteLogs) log_route(db, route_log)
		return {
			content: 'I cannot perform that action. Deleting or permanently destroying notes is not allowed through the AI assistant.',
			notesChanged: false,
			routeLog: route_log,
		}
	}

	// 2. Resolve provider
	let effective_route_target: 'cheap' | 'premium' = 'cheap' === decision.route ? 'cheap' : 'premium'
	let provider_resolution: ResolvedProvider = resolve_provider_for_route(db, effective_route_target)
	if (options?.forcedModel && options.forcedModel.trim()) {
		provider_resolution = resolve_provider_for_forced_model(db, options.forcedModel)
		effective_route_target = provider_resolution.route_target || effective_route_target
		route_log.route = effective_route_target
		route_log.reason = `Thread model locked to ${options.forcedModel}. ${decision.reason}`
	}

	let { provider, model, provider_id } = provider_resolution
	route_log.providerId = provider_id
	route_log.model = model

	// 3. Run turn with tool loop
	let notes_changed = false
	let forced_note_tool_retry_used = false
	const input_messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = history
		.filter((m: { role: string }) => 'user' === m.role || 'assistant' === m.role)
		.map((m: { role: string; content?: string | null }) => ({
			role: m.role as 'user' | 'assistant',
			content: m.content || '',
		}))

	try {
		for (let step = 0; step < 6; step += 1) {
			const turn_input: AiProviderTurnInput = {
				model,
				systemPrompt: system_prompt,
				messages: input_messages,
				tools: AI_TOOLS as unknown as AiProviderTurnInput['tools'],
			}

			const output: AiProviderTurnOutput = await provider.sendTurn(turn_input)

			// Track usage
			if (output.usage) {
				route_log.inputTokens = accumulate_usage_value(route_log.inputTokens, output.usage.inputTokens)
				route_log.outputTokens = accumulate_usage_value(route_log.outputTokens, output.usage.outputTokens)
			}

			// No tool calls — we have a text response
			if (!output.toolCalls.length) {
				if (note_edit_requested_recently && !notes_changed && !forced_note_tool_retry_used) {
					forced_note_tool_retry_used = true
					if (output.content) {
						input_messages.push({ role: 'assistant', content: output.content })
					}
					input_messages.push({
						role: 'user',
						content: 'The user requested a note edit. You must execute note tools now before replying. Use update_note_by_title when a note title is provided. If editing fails, report the exact tool error and any matching note candidates.',
					})
					continue
				}

				const content = enforce_note_edit_truthfulness(output.content, notes_changed)
				if (!content) {
					if (ai_settings.aiEnableRouteLogs) log_route(db, route_log)
					return {
						content: 'I could not generate a response. Please try again.',
						notesChanged: notes_changed,
						routeLog: route_log,
					}
				}
				if (ai_settings.aiEnableRouteLogs) log_route(db, route_log)
				return {
					content: linkify_note_ids(db, content),
					notesChanged: notes_changed,
					routeLog: route_log,
				}
			}

			// Add assistant response to input for the next turn
			if (output.content) {
				input_messages.push({ role: 'assistant', content: output.content })
			}

			// Execute tool calls
			const tool_ctx: ToolExecutionContext = { threadId: thread.id, model }
			for (const tool_call of output.toolCalls) {
				const execution = execute_tool_call(db, tool_call, tool_ctx)
				if (execution.notesChanged) notes_changed = true
				input_messages.push({
					role: 'assistant',
					content: `Tool result for ${tool_call.name}: ${execution.output}`,
				})
			}
		}

		// Loop exhausted
		if (ai_settings.aiEnableRouteLogs) log_route(db, route_log)
		return {
			content: 'I reached the tool-call limit for this request. Please narrow the question and try again.',
			notesChanged: notes_changed,
			routeLog: route_log,
		}
	} catch (err) {
		// Cheap provider failure — fall back to premium
		if ('cheap' === effective_route_target) {
			const premium = resolve_provider_for_route(db, 'premium')
			provider = premium.provider
			model = premium.model
			provider_id = premium.provider_id
			route_log.providerId = provider_id
			route_log.model = model
			route_log.route = 'premium'
			route_log.fallbackUsed = true
			route_log.fallbackReason = err instanceof Error ? err.message : 'Cheap provider failed'

			try {
				const fallback_input: AiProviderTurnInput = {
					model,
					systemPrompt: system_prompt,
					messages: input_messages,
					tools: AI_TOOLS as unknown as AiProviderTurnInput['tools'],
				}
				const fallback_output = await provider.sendTurn(fallback_input)

				if (fallback_output.usage) {
					route_log.inputTokens = accumulate_usage_value(route_log.inputTokens, fallback_output.usage.inputTokens)
					route_log.outputTokens = accumulate_usage_value(route_log.outputTokens, fallback_output.usage.outputTokens)
				}

				const content = enforce_note_edit_truthfulness(
					fallback_output.content || 'I could not generate a response. Please try again.',
					notes_changed,
				)
				if (ai_settings.aiEnableRouteLogs) log_route(db, route_log)
				return {
					content: linkify_note_ids(db, content),
					notesChanged: notes_changed,
					routeLog: route_log,
				}
			} catch (fallback_err) {
				route_log.fallbackReason = `${route_log.fallbackReason}; premium fallback also failed: ${fallback_err instanceof Error ? fallback_err.message : 'Unknown error'}`
				if (ai_settings.aiEnableRouteLogs) log_route(db, route_log)
				throw new Error(`Both cheap and premium providers failed. ${fallback_err instanceof Error ? fallback_err.message : 'Unknown error'}`)
			}
		}

		// Premium provider failure
		if (ai_settings.aiEnableRouteLogs) log_route(db, route_log)
		throw err
	}
}

export { SYSTEM_PROMPT, derive_chat_title, resolve_ai_settings, resolve_api_key }
