// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  fireEvent.click(screen.getByLabelText('Note revision history'))
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
it('refreshes an open history list after invalidation without changing the reviewed snapshot', async () => {
  const restore = setup(vi.fn().mockResolvedValue(snapshot(1)))
  fireEvent.click(await screen.findByText(/Revision 1 ·/))
  await screen.findByText('snapshot 1')
  vi.mocked(window.strata.notes.history).mockResolvedValue([
    { revision: 6, source: 'api', operation: 'update', createdAt: 'now', bytes: 100 },
  ])
  act(() =>
    useAppStore.setState({ historyVersion: initial.historyVersion + 1, notes: [{ ...note, revision: 6 }] }),
  )
  await screen.findByText(/Revision 6 ·/)
  expect(screen.getByText('snapshot 1')).toBeTruthy()
  fireEvent.click(screen.getByText('Restore revision 1'))
  await screen.findByText(/Restore conflicted/)
  expect(restore).toHaveBeenCalledWith(note.id, 1, 5)
})

it('does not let a delayed manual history load replace a newer invalidation result', async () => {
  const pending: Array<(value: Array<{ revision: number; source: string; createdAt: string }>) => void> = []
  Object.defineProperty(window, 'strata', {
    configurable: true,
    value: {
      notes: {
        history: vi.fn(() => new Promise((resolve) => pending.push(resolve))),
        getRevision: vi.fn(),
        restoreRevision: vi.fn(),
      },
    },
  })
  useAppStore.setState({ notes: [note], selectedNoteId: note.id, drafts: {} })
  render(<NoteHistory />)
  fireEvent.click(screen.getByLabelText('Note revision history'))
  await waitFor(() => expect(pending).toHaveLength(1))
  act(() => useAppStore.setState({ historyVersion: initial.historyVersion + 1 }))
  await waitFor(() => expect(pending).toHaveLength(2))
  await act(async () => pending[1]([{ revision: 6, source: 'api', createdAt: 'now' }]))
  await screen.findByText(/Revision 6 ·/)
  await act(async () => pending[0]([{ revision: 1, source: 'human', createdAt: 'before' }]))
  expect(screen.getByText(/Revision 6 ·/)).toBeTruthy()
  expect(screen.queryByText(/Revision 1 ·/)).toBeNull()
})

it('keeps a pane history scoped to its note when another note has a dirty draft', async () => {
  setup(vi.fn().mockResolvedValue(snapshot(1)))
  cleanup()
  useAppStore.setState({ selectedNoteId: 'other', drafts: { other: 'unsaved' } })
  render(<NoteHistory noteId={note.id} />)
  fireEvent.click(screen.getByLabelText('Note revision history'))
  fireEvent.click(await screen.findByText(/Revision 1 ·/))
  await screen.findByText('snapshot 1')
  expect(window.strata.notes.history).toHaveBeenLastCalledWith(note.id)
  expect((screen.getByText('Restore revision 1') as HTMLButtonElement).disabled).toBe(false)
  act(() => useAppStore.setState({ drafts: { [note.id]: 'unsaved' } }))
  expect((screen.getByText('Restore revision 1') as HTMLButtonElement).disabled).toBe(true)
})
