// Pure helpers for building the message list sent to an AI provider.
//
// These functions are deliberately decoupled from the database and the
// provider so they can be unit-tested in the renderer project (whose
// `tsconfig` does not include Node types) without dragging in
// `better-sqlite3` and other main-process dependencies.

import type { AiProviderTurnOutput, ProviderMessage } from './types'

/**
 * Append the assistant's turn and each tool's result to the conversation in
 * the shape providers expect for the next step.
 *
 * The earlier implementation dropped the assistant's `tool_calls` and
 * pushed each tool outcome as a plain `{role: 'assistant', content: 'Tool
 * result ...'}` message. That made the second turn look like two
 * consecutive assistant messages and stripped the `tool_call_id` that
 * OpenAI/DeepSeek/Kimi/OpenRouter require to associate a tool result with
 * the call that produced it. As a result, multi-step flows silently lost
 * context and often repeated the same tool call or returned a confused
 * answer.
 */
export const record_assistant_turn = (
  messages: ProviderMessage[],
  content: string,
  tool_calls: AiProviderTurnOutput['toolCalls'],
  tool_results: Array<{ id: string; output: string }>,
): void => {
  if (tool_calls.length > 0) {
    messages.push({
      role: 'assistant',
      content,
      toolCalls: tool_calls,
    })
  } else if (content) {
    messages.push({ role: 'assistant', content })
  }

  for (const result of tool_results) {
    messages.push({
      role: 'tool',
      content: result.output,
      toolCallId: result.id,
    })
  }
}

/**
 * Build the initial conversation history from the persisted message log.
 * Only `user` and `assistant` turns are carried over; tool call/result
 * history is reconstructed in-memory for the current turn.
 */
export const build_history_messages = (
  history: Array<{ role: string; content?: string | null }>,
): ProviderMessage[] => {
  const messages: ProviderMessage[] = []
  for (const m of history) {
    if ('user' === m.role) {
      messages.push({ role: 'user', content: m.content || '' })
    } else if ('assistant' === m.role) {
      messages.push({ role: 'assistant', content: m.content || '' })
    }
  }
  return messages
}

export const budgetHistory = (
  history: Array<{ role: string; content?: string | null }>,
  maxCharacters = 24000,
): ProviderMessage[] => {
  const messages = build_history_messages(history)
  const selected: ProviderMessage[] = []
  let remaining = maxCharacters
  for (const message of messages.reverse()) {
    if (remaining <= 0) break
    const content = message.content.slice(-remaining)
    selected.unshift({ ...message, content })
    remaining -= content.length
  }
  return selected
}

export const runProviderToolLoop = async (options: {
  provider: import('./types').AiProvider
  model: string
  systemPrompt: string
  messages: ProviderMessage[]
  tools: import('./types').AiToolDefinition[]
  execute: (call: import('./types').NormalizedToolCall) => {
    output: string
    notesChanged: boolean
    proposalId?: string
  }
  onUsage?: (usage: AiProviderTurnOutput['usage']) => void
}): Promise<{ content: string; notesChanged: boolean; proposalIds: string[]; toolCalls: number }> => {
  let notesChanged = false
  let toolCalls = 0
  const proposalIds: string[] = []
  for (let step = 0; step < 6; step++) {
    if (JSON.stringify(options.messages).length + options.systemPrompt.length > 100000)
      return {
        content: 'Context budget reached. Narrow the request to continue.',
        notesChanged,
        proposalIds,
        toolCalls,
      }
    const output = await options.provider.sendTurn({
      model: options.model,
      systemPrompt: options.systemPrompt,
      messages: options.messages,
      tools: options.tools,
    })
    options.onUsage?.(output.usage)
    if (!output.toolCalls.length)
      return {
        content: proposalIds.length
          ? 'Edits are awaiting your approval in the proposal panel.'
          : output.content,
        notesChanged,
        proposalIds,
        toolCalls,
      }
    if (output.toolCalls.length > 20 || toolCalls + output.toolCalls.length > 30)
      return {
        content: 'Tool-call limit reached. Narrow the request to continue.',
        notesChanged,
        proposalIds,
        toolCalls,
      }
    const results = []
    for (const call of output.toolCalls) {
      const execution = options.execute(call)
      toolCalls++
      notesChanged ||= execution.notesChanged
      if (execution.proposalId) proposalIds.push(execution.proposalId)
      results.push({ id: call.id, output: execution.output })
    }
    record_assistant_turn(options.messages, output.content, output.toolCalls, results)
  }
  return {
    content: proposalIds.length
      ? 'Edits are awaiting your approval in the proposal panel.'
      : 'Tool-call limit reached. Narrow the request to continue.',
    notesChanged,
    proposalIds,
    toolCalls,
  }
}
