// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NoteHistory } from '../components/KnowledgeStatus'
import { useAppStore } from '../state/useAppStore'
import type { Note, NoteRevision } from '@shared/types'
const initial = useAppStore.getState()
const note: Note = {
  id: '00000000-0000-4000-8000-000000000001',
  revision: 5,
  content: 'current',
  contentLoaded: true,
  title: 'Current',
  tags: [],
  starred: false,
  archived: false,
  projectId: null,
  deletedAt: null,
  createdAt: '',
  updatedAt: '',
}
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  Reflect.deleteProperty(window, 'strata')
})
const setup = (
  getRevision: unknown,
  restoreRevision = vi.fn().mockRejectedValue(new Error('REVISION_CONFLICT')),
) => {
  Object.defineProperty(window, 'strata', {
    configurable: true,
    value: {
      notes: {
        history: vi
          .fn()
          .mockResolvedValue([1, 2].map((revision) => ({ revision, source: 'human', createdAt: 'then' }))),
        getRevision,
        restoreRevision,
      },
    },
  })
  useAppStore.setState({ notes: [note], selectedNoteId: note.id, drafts: {} })
  render(<NoteHistory />)
  fireEvent.click(screen.getByText('Note revision history'))
  return restoreRevision
}
const snapshot = (revision: number): NoteRevision => ({
  noteId: note.id,
  revision,
  source: 'human',
  operation: 'update',
  createdAt: '',
  snapshot: { ...note, content: `snapshot ${revision}` },
})
it('ignores an older snapshot response and resets history when notes change', async () => {
  const pending: Array<(value: NoteRevision) => void> = []
  setup(vi.fn(() => new Promise((resolve) => pending.push(resolve))))
  fireEvent.click(await screen.findByText(/Revision 1 ·/))
  fireEvent.click(screen.getByText(/Revision 2 ·/))
  await act(async () => pending[1](snapshot(2)))
  expect(screen.getByText('snapshot 2')).toBeTruthy()
  await act(async () => pending[0](snapshot(1)))
  expect(screen.queryByText('snapshot 1')).toBeNull()
  act(() => useAppStore.setState({ notes: [{ ...note, id: 'other' }], selectedNoteId: 'other' }))
  expect(screen.queryByText('snapshot 2')).toBeNull()
  expect(screen.queryByText(/Revision 2 ·/)).toBeNull()
})
it('restores against the revision read when the historical snapshot was selected', async () => {
  const restore = setup(vi.fn().mockResolvedValue(snapshot(1)))
  fireEvent.click(await screen.findByText(/Revision 1 ·/))
  await screen.findByText('snapshot 1')
  act(() => useAppStore.setState({ notes: [{ ...note, revision: 6, content: 'external edit' }] }))
  fireEvent.click(screen.getByText('Restore revision 1'))
  await screen.findByText(/Restore conflicted/)
  expect(restore).toHaveBeenCalledWith(note.id, 1, 5)
})
