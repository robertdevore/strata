import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
import { build_open_notes_context } from '@main/ipc/aiHandlers'
import { AI_TOOLS, toolsForMode, execute_tool_call } from '@main/ai/tools'
import type { StrataDatabase } from '@main/db'

it('keeps complete JSON entries within the context budget and reports omitted notes', () => {
  const notes = Array.from({ length: 12 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    title: '\\"'.repeat(80),
    content: '\u0000'.repeat(12000),
  }))
  const context = build_open_notes_context(notes)
  expect(context.length).toBeLessThanOrEqual(4000)
  const value = JSON.parse(context.slice(context.indexOf('\n') + 1))
  expect(value.notes.length).toBeGreaterThan(0)
  expect(value.omitted).toBeGreaterThan(0)
  expect(value.notes.length + value.omitted).toBe(12)
  expect(value.notes[0]).toEqual({ id: notes[0].id, title: notes[0].title, snippet: '\u0000'.repeat(200) })
  expect(build_open_notes_context([])).toBe('')
})
it('does not split surrogate pairs in an excerpt', () => {
  const value = build_open_notes_context([
    { id: 'one', title: 'Unicode', content: 'a'.repeat(199) + '🧭tail' },
  ])
  const parsed = JSON.parse(value.slice(value.indexOf('\n') + 1))
  expect(parsed.notes[0].snippet).toBe('a'.repeat(199) + '🧭')
  expect(parsed.omitted).toBe(0)
})
it('keeps all read tools while excluding mutation schemas in read-only and unknown modes', () => {
  const mutations = [
    'create_note',
    'update_note',
    'update_note_by_title',
    'create_project',
    'update_project',
    'delete_project',
    'reorder_projects',
  ]
  const reads = AI_TOOLS.filter((tool) => !mutations.includes(tool.name))
  expect(toolsForMode('read_only')).toEqual(reads)
  expect(toolsForMode('invalid legacy value')).toEqual(reads)
  expect(toolsForMode('confirm')).toEqual(AI_TOOLS)
  expect(toolsForMode('auto_apply')).toEqual(AI_TOOLS)
  const db = { getSettings: () => ({ aiEditMode: 'invalid legacy value' }) } as unknown as StrataDatabase
  const result = execute_tool_call(db, {
    id: 'test',
    name: 'create_note',
    argumentsJson: '{"content":"must not write"}',
  })
  expect(JSON.parse(result.output).error.code).toBe('READ_ONLY')
})
