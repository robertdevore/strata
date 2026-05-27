// Generic Chat Completions provider (OpenAI-compatible)
// Supports DeepSeek, Kimi/Moonshot, OpenRouter, custom endpoints, llama.cpp

import type { AiProvider, AiProviderTurnInput, AiProviderTurnOutput, NormalizedToolCall } from '../types'

interface ChatCompletionsResponse {
	choices: Array<{
		message: {
			role: string
			content: string | null
			tool_calls?: Array<{
				id: string
				type: 'function'
				function: {
					name: string
					arguments: string
				}
			}>
		}
		finish_reason: string
	}>
	usage?: {
		prompt_tokens?: number
		completion_tokens?: number
		total_tokens?: number
	}
}

export class ChatCompletionsProvider implements AiProvider {
	public readonly providerId: string
	public readonly kind = 'openai_chat_completions'
	private readonly apiKey: string
	private readonly baseUrl: string

	constructor(
		apiKey: string,
		baseUrl: string,
		providerId: string,
	) {
		this.apiKey = apiKey
		this.baseUrl = baseUrl
		this.providerId = providerId
	}

	async sendTurn(input: AiProviderTurnInput): Promise<AiProviderTurnOutput> {
		const messages: Array<{ role: string; content: string }> = [
			{ role: 'system', content: input.systemPrompt },
			...input.messages.map((msg) => ({
				role: msg.role,
				content: msg.content,
			})),
		]

		// Convert Strata tools to OpenAI Chat Completions format
		const openai_tools = input.tools.map((tool) => ({
			type: 'function' as const,
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			},
		}))

		const base_url = this.normalize_base_url(this.baseUrl)
		const body: Record<string, unknown> = {
			model: input.model,
			messages,
			tools: openai_tools,
			tool_choice: 'auto',
		}

		if (undefined !== input.temperature) {
			body.temperature = input.temperature
		}

		const response = await fetch(`${base_url}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		})

		if (!response.ok) {
			const details = await response.text().catch(() => '')
			throw new Error(`Chat Completions request failed (${response.status}): ${details || response.statusText}`)
		}

		const payload = (await response.json()) as ChatCompletionsResponse
		return this.normalize(payload)
	}

	private normalize(payload: ChatCompletionsResponse): AiProviderTurnOutput {
		const choice = payload.choices?.[0]
		const content = choice?.message?.content?.trim() || ''
		const toolCalls: NormalizedToolCall[] = []

		if (choice?.message?.tool_calls) {
			for (const tc of choice.message.tool_calls) {
				toolCalls.push({
					id: tc.id,
					name: tc.function.name,
					argumentsJson: tc.function.arguments || '{}',
				})
			}
		}

		return {
			content,
			toolCalls,
			raw: payload,
			usage: payload.usage ? {
				inputTokens: payload.usage.prompt_tokens,
				outputTokens: payload.usage.completion_tokens,
				totalTokens: payload.usage.total_tokens,
			} : undefined,
		}
	}

	/**
	 * Normalize base URLs that may or may not include the /v1 suffix.
	 * Strips trailing slash, appends /v1 if not present.
	 */
	private normalize_base_url(raw: string): string {
		let url = raw.replace(/\/+$/, '')
		if (!url.endsWith('/v1')) {
			url = `${url}/v1`
		}
		return url
	}
}
