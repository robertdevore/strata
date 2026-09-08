import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatCompletionsProvider } from '../../../main/ai/providers/ChatCompletionsProvider'
import { OpenAiResponsesProvider } from '../../../main/ai/providers/OpenAiResponsesProvider'
import { record_assistant_turn } from '../../../main/ai/toolLoop'
import type { NormalizedToolCall, ProviderMessage } from '../../../main/ai/types'

describe('AI tool-loop message wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('record_assistant_turn', () => {
    it('emits a single assistant message carrying tool_calls and a tool result per call', () => {
      const messages: ProviderMessage[] = [{ role: 'user', content: 'find the meeting note' }]
      const tool_calls: NormalizedToolCall[] = [
        { id: 'call_alpha', name: 'search_notes', argumentsJson: '{"query":"meeting"}' },
      ]
      const tool_results = [{ id: 'call_alpha', output: '{"notes":[]}' }]

      record_assistant_turn(messages, 'Searching now.', tool_calls, tool_results)

      expect(messages).toEqual([
        { role: 'user', content: 'find the meeting note' },
        { role: 'assistant', content: 'Searching now.', toolCalls: tool_calls },
        { role: 'tool', content: '{"notes":[]}', toolCallId: 'call_alpha' },
      ])
    })

    it('emits each tool result with the matching tool_call_id when several calls are returned', () => {
      const messages: ProviderMessage[] = []
      const tool_calls: NormalizedToolCall[] = [
        { id: 'call_a', name: 'list_notes', argumentsJson: '{}' },
        { id: 'call_b', name: 'get_note', argumentsJson: '{"note_id":"n1"}' },
      ]
      const tool_results = [
        { id: 'call_a', output: '{"notes":[]}' },
        { id: 'call_b', output: '{"note":null}' },
      ]

      record_assistant_turn(messages, '', tool_calls, tool_results)

      expect(messages).toEqual([
        { role: 'assistant', content: '', toolCalls: tool_calls },
        { role: 'tool', content: '{"notes":[]}', toolCallId: 'call_a' },
        { role: 'tool', content: '{"note":null}', toolCallId: 'call_b' },
      ])
    })

    it('does not emit any tool message when the model returns a plain text response', () => {
      const messages: ProviderMessage[] = [{ role: 'user', content: 'hello' }]

      record_assistant_turn(messages, 'Hi there.', [], [])

      expect(messages).toEqual([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'Hi there.' },
      ])
    })
  })

  describe('ChatCompletionsProvider.sendTurn', () => {
    const setup_fetch = (response_body: unknown) => {
      const fetch_mock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(response_body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      vi.stubGlobal('fetch', fetch_mock)
      return fetch_mock
    }

    const base_response = {
      choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
    }

    it('forwards assistant tool_calls and tool result messages with the matching tool_call_id', async () => {
      const fetch_mock = setup_fetch(base_response)
      const provider = new ChatCompletionsProvider('sk-test', 'https://api.example.com/v1', 'openai')

      await provider.sendTurn({
        model: 'gpt-4o',
        systemPrompt: 'You are Strata.',
        messages: [
          { role: 'user', content: 'search' },
          {
            role: 'assistant',
            content: 'Looking up.',
            toolCalls: [{ id: 'call_xyz', name: 'search_notes', argumentsJson: '{"query":"x"}' }],
          },
          { role: 'tool', content: '{"notes":[]}', toolCallId: 'call_xyz' },
        ],
        tools: [],
      })

      const body = JSON.parse((fetch_mock.mock.calls[0][1] as RequestInit).body as string) as {
        messages: Array<{
          role: string
          content?: string | null
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
          tool_call_id?: string
        }>
      }

      // The system message is prepended by the provider
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are Strata.' })
      expect(body.messages[1]).toEqual({ role: 'user', content: 'search' })

      // The assistant text turn must carry the tool_calls field so the
      // provider can pair subsequent tool results with this turn.
      expect(body.messages[2]).toMatchObject({ role: 'assistant', content: 'Looking up.' })
      expect(body.messages[2].tool_calls).toEqual([
        { id: 'call_xyz', type: 'function', function: { name: 'search_notes', arguments: '{"query":"x"}' } },
      ])

      // The tool result must arrive as role: 'tool' with the originating call id
      expect(body.messages[3]).toEqual({
        role: 'tool',
        content: '{"notes":[]}',
        tool_call_id: 'call_xyz',
      })
    })

    it('does not emit tool_calls on assistant turns that have no calls', async () => {
      const fetch_mock = setup_fetch(base_response)
      const provider = new ChatCompletionsProvider('sk-test', 'https://api.example.com/v1', 'openai')

      await provider.sendTurn({
        model: 'gpt-4o',
        systemPrompt: 'sys',
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
        tools: [],
      })

      const body = JSON.parse((fetch_mock.mock.calls[0][1] as RequestInit).body as string) as {
        messages: Array<{ role: string; content?: string | null; tool_calls?: unknown }>
      }
      const assistant_message = body.messages.find((m) => 'assistant' === m.role)
      expect(assistant_message).toBeDefined()
      expect(assistant_message?.tool_calls).toBeUndefined()
    })
  })

  describe('OpenAiResponsesProvider.sendTurn', () => {
    const setup_fetch = (response_body: unknown) => {
      const fetch_mock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(response_body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      vi.stubGlobal('fetch', fetch_mock)
      return fetch_mock
    }

    const base_response = {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'done' }],
        },
      ],
    }

    it('sends function_call and function_call_output items so a tool result can be matched back to its call', async () => {
      const fetch_mock = setup_fetch(base_response)
      const provider = new OpenAiResponsesProvider('sk-test', 'https://api.openai.com')

      await provider.sendTurn({
        model: 'gpt-4o',
        systemPrompt: 'You are Strata.',
        messages: [
          { role: 'user', content: 'search' },
          {
            role: 'assistant',
            content: 'Looking up.',
            toolCalls: [{ id: 'call_qq', name: 'search_notes', argumentsJson: '{"query":"x"}' }],
          },
          { role: 'tool', content: '{"notes":[]}', toolCallId: 'call_qq' },
        ],
        tools: [],
      })

      const body = JSON.parse((fetch_mock.mock.calls[0][1] as RequestInit).body as string) as {
        instructions: string
        input: Array<Record<string, unknown>>
      }

      expect(body.instructions).toBe('You are Strata.')
      // The system prompt must travel through `instructions`, not the input array
      const has_system_input = body.input.some((item) => 'system' === item.role)
      expect(has_system_input).toBe(false)

      // The assistant turn must include a function_call item keyed by call_id
      const function_call = body.input.find((item) => 'function_call' === item.type)
      expect(function_call).toEqual({
        type: 'function_call',
        call_id: 'call_qq',
        name: 'search_notes',
        arguments: '{"query":"x"}',
      })

      // The tool result must travel as a function_call_output item with the same call_id
      const function_call_output = body.input.find((item) => 'function_call_output' === item.type)
      expect(function_call_output).toEqual({
        type: 'function_call_output',
        call_id: 'call_qq',
        output: '{"notes":[]}',
      })
    })
  })
})
