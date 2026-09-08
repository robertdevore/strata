import type { AiProviderTurnInput } from '@main/ai/types'
import { afterEach, expect, it, vi } from 'vitest'
import { ChatCompletionsProvider } from '@main/ai/providers/ChatCompletionsProvider'
const input: AiProviderTurnInput = {
  model: 'test',
  systemPrompt: 'instructions',
  messages: [{ role: 'user' as const, content: 'hello' }],
  temperature: 0.2,
  tools: [
    {
      type: 'function' as const,
      name: 'search',
      description: 'search',
      parameters: { type: 'object', properties: {} },
    },
  ],
}
afterEach(() => vi.unstubAllGlobals())
it('omits unsupported fields and represents instructions without system roles', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] })))
  vi.stubGlobal('fetch', fetcher)
  const provider = new ChatCompletionsProvider('test', 'https://example.com/v1', 'custom', {
    tools: false,
    systemMessages: false,
    temperature: false,
  })
  expect((await provider.sendTurn(input)).content).toBe('hello')
  const body = JSON.parse(fetcher.mock.calls[0][1].body)
  expect(body).not.toHaveProperty('tools')
  expect(body).not.toHaveProperty('tool_choice')
  expect(body).not.toHaveProperty('temperature')
  expect(body.messages[0]).toEqual({ role: 'user', content: 'instructions' })
})
it('does not silently reinterpret a tool transcript on a text-only endpoint', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const provider = new ChatCompletionsProvider('test', 'https://example.com/v1', 'custom', {
    tools: false,
    systemMessages: true,
    temperature: true,
  })
  await expect(
    provider.sendTurn({ ...input, messages: [{ role: 'tool', content: 'result', toolCallId: 'call' }] }),
  ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' })
  expect(fetcher).not.toHaveBeenCalled()
})
it('rejects unexpected tools when tool support is disabled', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { tool_calls: [{ id: 'call', function: { name: 'write', arguments: '{}' } }] } },
          ],
        }),
      ),
    ),
  )
  const provider = new ChatCompletionsProvider('test', 'https://example.com/v1', 'custom', {
    tools: false,
    systemMessages: true,
    temperature: true,
  })
  await expect(provider.sendTurn(input)).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' })
})
