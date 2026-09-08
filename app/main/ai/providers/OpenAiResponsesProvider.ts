import { requestProviderJson, validateProviderUrl } from '../providerRequest'
// OpenAI Responses API provider
// Uses the /v1/responses endpoint with input/instructions/tools

import type {
  AiProvider,
  AiProviderTurnInput,
  AiProviderTurnOutput,
  NormalizedToolCall,
  ProviderMessage,
} from '../types'

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

type OpenAiInputItem =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

/**
 * Translate a normalized ProviderMessage into the items the OpenAI Responses
 * API accepts. The Responses API does not consume `role: 'tool'` chat
 * messages: tool invocations are first-class `function_call` / `function_call_output`
 * items keyed by `call_id`, so the assistant's call list and the matching
 * outputs must both be present in the input array or the model loses
 * continuity between tool turns. `role: 'system'` is intentionally skipped
 * here because the system prompt is sent via the `instructions` field.
 */
const to_responses_input_item = (msg: ProviderMessage): OpenAiInputItem | OpenAiInputItem[] => {
  if (msg.role === 'tool') {
    return {
      type: 'function_call_output',
      call_id: msg.toolCallId,
      output: msg.content,
    }
  }
  if (msg.role === 'assistant' && 'toolCalls' in msg && msg.toolCalls.length > 0) {
    const items: OpenAiInputItem[] = []
    if (msg.content) {
      items.push({ role: 'assistant', content: msg.content })
    }
    for (const tc of msg.toolCalls) {
      items.push({
        type: 'function_call',
        call_id: tc.id,
        name: tc.name,
        arguments: tc.argumentsJson || '{}',
      })
    }
    return items
  }
  if (msg.role === 'system') {
    // System prompt is provided via the `instructions` field, not the
    // input array. Skip it to avoid an API validation error.
    return []
  }
  return {
    role: msg.role,
    content: msg.content,
  }
}

export class OpenAiResponsesProvider implements AiProvider {
  public readonly providerId = 'openai-responses'
  public readonly kind = 'openai_responses'
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(apiKey: string, baseUrl = 'https://api.openai.com') {
    this.apiKey = apiKey
    this.baseUrl = validateProviderUrl(baseUrl)
  }

  async sendTurn(input: AiProviderTurnInput): Promise<AiProviderTurnOutput> {
    const openai_input: OpenAiInputItem[] = input.messages.flatMap((msg) => to_responses_input_item(msg))

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

    const payload = await requestProviderJson(`${this.baseUrl}/v1/responses`, {
      method: 'POST',
      signal: input.signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    return this.normalize(payload as OpenAiResponsesPayload)
  }

  private normalize(payload: OpenAiResponsesPayload): AiProviderTurnOutput {
    const content = this.extract_text(payload)
    const toolCalls = this.extract_tool_calls(payload)

    return {
      content,
      toolCalls,
      raw: payload,
      usage: payload.usage
        ? {
            inputTokens: payload.usage.input_tokens,
            outputTokens: payload.usage.output_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : undefined,
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
