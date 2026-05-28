// OpenAI Responses API provider
// Uses the /v1/responses endpoint with input/instructions/tools

import type { AiProvider, AiProviderTurnInput, AiProviderTurnOutput, NormalizedToolCall } from '../types'

interface OpenAiResponsesPayload {
	output?: OpenAiResponseOutputItem[]
	output_text?: string
	usage?: {
		input_tokens?: number
		output_tokens?: number
		total_tokens?: number
	}
}

interface OpenAiResponseOutputItem {
	type: string
	name?: string
	arguments?: string
	call_id?: string
	content?: Array<{ type: string; text?: string }>
}

export class OpenAiResponsesProvider implements AiProvider {
	public readonly providerId = 'openai-responses'
	public readonly kind = 'openai_responses'
	private readonly apiKey: string
	private readonly baseUrl: string

	constructor(
		apiKey: string,
		baseUrl = 'https://api.openai.com',
	) {
		this.apiKey = apiKey
		this.baseUrl = baseUrl
	}

	async sendTurn(input: AiProviderTurnInput): Promise<AiProviderTurnOutput> {
		const openai_input = input.messages.map((msg) => ({
			role: msg.role,
			content: msg.content,
		}))

		const body: Record<string, unknown> = {
			model: input.model,
			input: openai_input,
			instructions: input.systemPrompt,
			tools: input.tools,
			tool_choice: 'auto',
			store: false,
		}

		if (undefined !== input.temperature) {
			body.temperature = input.temperature
		}

		const response = await fetch(`${this.baseUrl}/v1/responses`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		})

		if (!response.ok) {
			const details = await response.text().catch(() => '')
			throw new Error(`OpenAI Responses request failed (${response.status}): ${details || response.statusText}`)
		}

		const payload = (await response.json()) as OpenAiResponsesPayload
		return this.normalize(payload)
	}

	private normalize(payload: OpenAiResponsesPayload): AiProviderTurnOutput {
		const content = this.extract_text(payload)
		const toolCalls = this.extract_tool_calls(payload)

		return {
			content,
			toolCalls,
			raw: payload,
			usage: payload.usage ? {
				inputTokens: payload.usage.input_tokens,
				outputTokens: payload.usage.output_tokens,
				totalTokens: payload.usage.total_tokens,
			} : undefined,
		}
	}

	private extract_text(payload: OpenAiResponsesPayload): string {
		if ('string' === typeof payload.output_text && payload.output_text.trim()) {
			return payload.output_text.trim()
		}

		const output = Array.isArray(payload.output) ? payload.output : []
		for (const item of output) {
			if ('message' !== item.type || !Array.isArray(item.content)) continue
			const text = item.content
				.filter((c) => 'output_text' === c.type)
				.map((c) => c.text || '')
				.join('')
				.trim()
			if (text) return text
		}

		return ''
	}

	private extract_tool_calls(payload: OpenAiResponsesPayload): NormalizedToolCall[] {
		const output = Array.isArray(payload.output) ? payload.output : []
		return output
			.filter((item) => 'function_call' === item.type && item.call_id && item.name)
			.map((item) => ({
				id: item.call_id || '',
				name: item.name || '',
				argumentsJson: item.arguments || '{}',
			}))
	}
}
