import { expect, it } from 'vitest'
import { formatExecutionReport, type MutationOutcome } from '@main/ai/execution'
it('reports partial success and pending approval without trusting the provider narrative', () => {
  const outcomes: MutationOutcome[] = [
    {
      operation: 'create_project',
      status: 'applied',
      entities: [{ kind: 'project', id: 'project', title: 'Saved project' }],
    },
    { operation: 'update_note', status: 'failed', errorCode: 'REVISION_CONFLICT', entities: [] },
    { operation: 'create_note', status: 'proposed', proposalId: 'proposal', entities: [] },
  ]
  const report = formatExecutionReport('I updated every note successfully.', outcomes, 'tool_limit', true)
  expect(report).toContain('Created project: Project “Saved project”')
  expect(report).toContain('Could not update note (REVISION_CONFLICT)')
  expect(report).toContain('awaiting your approval')
  expect(report).toContain('Proposed action: create note; not applied')
  expect(report).toContain('Tool-call limit reached')
  expect(report).not.toContain('every note successfully')
})
it('links actual saved note identities, escapes titles and bounds displayed entities', () => {
  const entities: MutationOutcome['entities'] = Array.from({ length: 1000 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    kind: 'note',
    title: 'Title](injected)',
    revision: 2,
  }))
  const report = formatExecutionReport(
    'fake',
    [{ operation: 'update_note', status: 'unchanged', entities }],
    'complete',
    true,
  )
  expect(report).toContain('No change needed')
  expect(report).toContain(
    '[Title\\]\\(injected\\)](#strata-note:00000000-0000-4000-8000-000000000001) (revision 2)',
  )
  expect(report.match(/#strata-note:/g)).toHaveLength(20)
  expect(report).toContain('and 980 more')
})
it('keeps retrieval answers and refuses unsupported mutation success claims', () => {
  expect(formatExecutionReport('Here is the requested explanation.', [], 'complete', false)).toBe(
    'Here is the requested explanation.',
  )
  expect(formatExecutionReport('Done, I updated the note.', [], 'complete', true)).toContain(
    'No changes were applied',
  )
  expect(formatExecutionReport('Done, I updated the note.', [], 'complete', true)).not.toContain('I updated')
  expect(formatExecutionReport('limit', [], 'context_limit', true)).toContain('Context budget reached')
})
it('counts the tool catalog in the hard context budget before contacting a provider', async () => {
  const { runProviderToolLoop } = await import('@main/ai/toolLoop')
  let called = false
  const result = await runProviderToolLoop({
    provider: {
      providerId: 'fixture',
      kind: 'custom_openai_compatible',
      sendTurn: async () => {
        called = true
        return { content: '', toolCalls: [] }
      },
    },
    model: 'fixture',
    systemPrompt: '',
    messages: [{ role: 'user', content: 'x'.repeat(95000) }],
    tools: [
      {
        type: 'function',
        name: 'fixture',
        description: 'x'.repeat(6000),
        parameters: { type: 'object', properties: {} },
      },
    ],
    execute: () => {
      throw new Error('Must not execute')
    },
  })
  expect(result.stop).toBe('context_limit')
  expect(called).toBe(false)
})
