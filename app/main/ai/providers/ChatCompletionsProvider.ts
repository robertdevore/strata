import { DomainError } from '../../../shared/errors'
import type { ProviderCapabilities } from '../../../shared/types'
import { requestProviderJson, validateProviderUrl } from '../providerRequest'
// Generic Chat Completions provider (OpenAI-compatible)
// Supports DeepSeek, Kimi/Moonshot, OpenRouter, custom endpoints, llama.cpp

import type {
  AiProvider,
  AiProviderTurnInput,
  AiProviderTurnOutput,
  NormalizedToolCall,
  ProviderMessage,
} from '../types'

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

interface ChatCompletionsMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/**
 * Translate a normalized ProviderMessage into the wire shape expected by
 * OpenAI's Chat Completions API (and compatible endpoints such as DeepSeek,
 * Kimi, OpenRouter, llama.cpp).
 *
 * - Assistant turns that include tool calls are emitted with `tool_calls`
 *   so the provider can pair them with subsequent `role: 'tool'` results.
 * - `role: 'tool'` results must carry the originating `tool_call_id`; without
 *   it, providers reject the result or silently drop it, breaking the
 *   multi-step tool loop.
 */
const to_chat_completions_message = (
  msg: ProviderMessage,
): ChatCompletionsMessage | ChatCompletionsMessage[] => {
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      content: msg.content,
      tool_call_id: msg.toolCallId,
    }
  }
  if (msg.role === 'assistant' && 'toolCalls' in msg && msg.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: msg.content,
      tool_calls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.argumentsJson || '{}',
        },
      })),
    }
  }
  return {
    role: msg.role,
    content: msg.content,
  }
}

export class ChatCompletionsProvider implements AiProvider {
  public readonly providerId: string
  public readonly kind = 'openai_chat_completions'
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly capabilities: ProviderCapabilities

  constructor(
    apiKey: string,
    baseUrl: string,
    providerId: string,
    capabilities: ProviderCapabilities = {
      tools: true,
      systemMessages: true,
      temperature: true,
    },
  ) {
    this.capabilities = capabilities
    this.apiKey = apiKey
    this.baseUrl = validateProviderUrl(baseUrl)
    this.providerId = providerId
  }

  async sendTurn(input: AiProviderTurnInput): Promise<AiProviderTurnOutput> {
    if (
      !this.capabilities.tools &&
      input.messages.some(
        (message) => message.role === 'tool' || ('toolCalls' in message && message.toolCalls.length > 0),
      )
    )
      throw new DomainError(
        'UNSUPPORTED_CAPABILITY',
        'This endpoint cannot continue a conversation containing tool calls',
      )
    const messages: ChatCompletionsMessage[] = [
      { role: this.capabilities.systemMessages ? 'system' : 'user', content: input.systemPrompt },
      ...input.messages.flatMap((msg) =>
        to_chat_completions_message(
          msg.role === 'system' && !this.capabilities.systemMessages
            ? { role: 'user', content: msg.content }
            : msg,
        ),
      ),
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
      ...(this.capabilities.tools && openai_tools.length ? { tools: openai_tools, tool_choice: 'auto' } : {}),
    }

    if (this.capabilities.temperature && undefined !== input.temperature) {
      body.temperature = input.temperature
    }

    const payload = await requestProviderJson(`${base_url}/chat/completions`, {
      method: 'POST',
      signal: input.signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const normalized = this.normalize(payload as ChatCompletionsResponse)
    if (!this.capabilities.tools && normalized.toolCalls.length)
      throw new DomainError(
        'UNSUPPORTED_CAPABILITY',
        'Endpoint returned tool calls while tool support is disabled',
      )
    return normalized
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
      usage: payload.usage
        ? {
            inputTokens: payload.usage.prompt_tokens,
            outputTokens: payload.usage.completion_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : undefined,
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
