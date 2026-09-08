import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../state/useAppStore'
import type { Note } from '@shared/types'
const initial = useAppStore.getState()
const note: Note = {
  id: '00000000-0000-4000-8000-000000000001',
  revision: 5,
  title: 'Original',
  content: 'Original',
  contentLoaded: true,
  createdAt: '2026-09-08T00:00:00Z',
  updatedAt: '2026-09-08T00:00:00Z',
  tags: [],
  starred: false,
  archived: false,
  projectId: null,
  deletedAt: null,
}
beforeEach(() =>
  useAppStore.setState({
    ...initial,
    notes: [note],
    listingIds: [note.id],
    selectedNoteId: note.id,
    openTabs: [note.id],
    drafts: {},
  }),
)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe('autosave revision safety', () => {
  it('preserves a draft when the API rejects a stale revision', async () => {
    const update = vi.fn().mockRejectedValue(new Error('REVISION_CONFLICT: stale'))
    vi.stubGlobal('window', { strata: { notes: { update } } })
    useAppStore.getState().setDraft(note.id, 'Human draft')
    await useAppStore.getState().flushDraft(note.id)
    expect(update).toHaveBeenCalledWith(note.id, { content: 'Human draft', expectedRevision: 5 })
    expect(useAppStore.getState().drafts[note.id]).toBe('Human draft')
    expect(useAppStore.getState().saveState).toBe('conflict')
  })
  it('serializes overlapping saves and does not clear edits typed during a save', async () => {
    let resolveFirst: (note: Note) => void = () => {}
    const update = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Note>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce({ ...note, revision: 7, content: 'Second' })
    vi.stubGlobal('window', { strata: { notes: { update } } })
    useAppStore.getState().setDraft(note.id, 'First')
    const first = useAppStore.getState().flushDraft(note.id)
    useAppStore.getState().setDraft(note.id, 'Second')
    const second = useAppStore.getState().flushDraft(note.id)
    expect(update).toHaveBeenCalledTimes(1)
    resolveFirst({ ...note, revision: 6, content: 'First' })
    await Promise.all([first, second])
    expect(update.mock.calls[1]).toEqual([note.id, { content: 'Second', expectedRevision: 6 }])
    expect(useAppStore.getState().notes[0].content).toBe('Second')
    expect(useAppStore.getState().drafts[note.id]).toBeUndefined()
  })
  it('uses server search and preserves dirty open notes outside a result page', async () => {
    const found = {
      ...note,
      id: '00000000-0000-4000-8000-000000000002',
      content: 'Unrelated snippet',
      title: 'Found',
      revision: 1,
    }
    const page = vi.fn().mockResolvedValue({ notes: [found], nextCursor: 'next' })
    vi.stubGlobal('window', { strata: { notes: { page } } })
    useAppStore.setState({ searchQuery: 'deep-body-match', drafts: { [note.id]: 'Unsaved' } })
    await useAppStore.getState().refreshListing()
    expect(
      useAppStore
        .getState()
        .filteredNotes()
        .map((note) => note.id),
    ).toEqual([found.id])
    expect(useAppStore.getState().drafts[note.id]).toBe('Unsaved')
    expect(useAppStore.getState().notes.some((item) => item.id === note.id)).toBe(true)
    expect(useAppStore.getState().nextCursor).toBe('next')
  })
})
