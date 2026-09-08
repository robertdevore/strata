import { afterEach, expect, it, vi } from 'vitest'
import { requestProviderJson } from '@main/ai/providerRequest'
import { ChatCompletionsProvider } from '@main/ai/providers/ChatCompletionsProvider'
import { OpenAiResponsesProvider } from '@main/ai/providers/OpenAiResponsesProvider'
import { createToolLoopState, runProviderToolLoop } from '@main/ai/toolLoop'
import { NO_CHANGED } from '@shared/changedDomains'
afterEach(() => vi.unstubAllGlobals())
it('rejects pre-cancelled requests before connecting and hides abort reasons', async () => {
  const controller = new AbortController()
  controller.abort('private fixture reason')
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(
    requestProviderJson('https://example.com', { signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'CANCELLED', message: 'AI request cancelled' })
  expect(fetch).not.toHaveBeenCalled()
})
it.each(['chat', 'responses'])('cancels a pending %s provider request through its signal', async (kind) => {
  const fetch = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new Error('private abort detail')), {
          once: true,
        })
      }),
  )
  vi.stubGlobal('fetch', fetch)
  const controller = new AbortController()
  const provider =
    kind === 'chat'
      ? new ChatCompletionsProvider('fixture-key', 'https://example.com', 'fixture')
      : new OpenAiResponsesProvider('fixture-key', 'https://example.com')
  const request = provider.sendTurn({
    signal: controller.signal,
    model: 'fixture',
    systemPrompt: '',
    messages: [],
    tools: [],
  })
  controller.abort()
  await expect(request).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true)
})
it('does not execute a late tool response after cancellation', async () => {
  const controller = new AbortController()
  const execute = vi.fn()
  const provider = {
    providerId: 'fixture',
    kind: 'openai_responses' as const,
    sendTurn: vi.fn(async () => {
      controller.abort()
      return { content: '', toolCalls: [{ id: 'late', name: 'create_note', argumentsJson: '{}' }] }
    }),
  }
  await expect(
    runProviderToolLoop({
      signal: controller.signal,
      provider,
      model: 'fixture',
      systemPrompt: '',
      messages: [],
      tools: [],
      execute,
    }),
  ).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(execute).not.toHaveBeenCalled()
  expect(provider.sendTurn).toHaveBeenCalledTimes(1)
})
it('keeps completed mutation facts but stops subsequent tool calls', async () => {
  const controller = new AbortController()
  const state = createToolLoopState()
  const execute = vi.fn(() => {
    controller.abort()
    return { output: '{}', changed: { ...NO_CHANGED, projects: true }, proposalId: 'existing-proposal' }
  })
  const provider = {
    providerId: 'fixture',
    kind: 'openai_responses' as const,
    sendTurn: vi.fn(async () => ({
      content: '',
      toolCalls: ['first', 'second'].map((id) => ({ id, name: 'create_project', argumentsJson: '{}' })),
    })),
  }
  await expect(
    runProviderToolLoop({
      signal: controller.signal,
      state,
      provider,
      model: 'fixture',
      systemPrompt: '',
      messages: [],
      tools: [],
      execute,
    }),
  ).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(execute).toHaveBeenCalledTimes(1)
  expect(state.changed.projects).toBe(true)
  expect(state.proposalIds).toEqual(['existing-proposal'])
  expect(state.toolCalls).toBe(1)
})
