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
  it('does not let delayed hydration replace a newer loaded revision', async () => {
    let complete: (value: Note) => void = () => {}
    vi.stubGlobal('window', {
      strata: {
        notes: {
          get: vi.fn(
            () =>
              new Promise((resolve) => {
                complete = resolve
              }),
          ),
        },
      },
    })
    useAppStore.setState({ notes: [{ ...note, contentLoaded: false, content: 'snippet' }] })
    const hydration = useAppStore.getState().hydrateNote(note.id)
    useAppStore.setState({ notes: [{ ...note, revision: 6, content: 'newer' }] })
    complete(note)
    await hydration
    expect(useAppStore.getState().notes[0]).toMatchObject({ revision: 6, content: 'newer' })
  })
  it('preserves a draft and its base revision when hydration finds an external edit', async () => {
    let complete: (value: Note) => void = () => {}
    vi.stubGlobal('window', {
      strata: {
        notes: {
          get: vi.fn(
            () =>
              new Promise((resolve) => {
                complete = resolve
              }),
          ),
        },
      },
    })
    useAppStore.setState({ notes: [{ ...note, contentLoaded: false, content: 'snippet' }] })
    const hydration = useAppStore.getState().hydrateNote(note.id)
    useAppStore.getState().setDraft(note.id, 'human draft')
    complete({ ...note, revision: 6, content: 'external edit' })
    await hydration
    expect(useAppStore.getState().notes[0].revision).toBe(5)
    expect(useAppStore.getState().drafts[note.id]).toBe('human draft')
    expect(useAppStore.getState().saveStates[note.id]).toBe('conflict')
  })

  it('preserves a draft when the API rejects a stale revision', async () => {
    const update = vi.fn().mockRejectedValue(new Error('REVISION_CONFLICT: stale'))
    vi.stubGlobal('window', { strata: { notes: { update } } })
    useAppStore.getState().setDraft(note.id, 'Human draft')
    await useAppStore.getState().flushDraft(note.id)
    expect(update).toHaveBeenCalledWith(note.id, { content: 'Human draft', expectedRevision: 5 })
    expect(useAppStore.getState().drafts[note.id]).toBe('Human draft')
    expect(useAppStore.getState().saveStates[note.id]).toBe('conflict')
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
it('keeps each pane status independent when another note finishes saving', async () => {
  const other = { ...note, id: '00000000-0000-4000-8000-000000000002' }
  let finishOther!: (value: Note) => void
  vi.stubGlobal('window', {
    strata: {
      notes: {
        update: vi.fn((id: string) =>
          id === note.id
            ? Promise.reject(new Error('REVISION_CONFLICT'))
            : new Promise((resolve) => {
                finishOther = resolve
              }),
        ),
      },
    },
  })
  useAppStore.setState({ notes: [note, other] })
  useAppStore.getState().setDraft(note.id, 'first draft')
  useAppStore.getState().setDraft(other.id, 'second draft')
  const first = useAppStore.getState().flushDraft(note.id)
  const second = useAppStore.getState().flushDraft(other.id)
  await first
  expect(useAppStore.getState().saveStates[note.id]).toBe('conflict')
  expect(useAppStore.getState().saveStates[other.id]).toBe('saving')
  finishOther({ ...other, revision: 6, content: 'second draft' })
  await second
  expect(useAppStore.getState().saveStates[other.id]).toBe('saved')
  expect(useAppStore.getState().saveStates[note.id]).toBe('conflict')
  useAppStore.getState().setDraft(note.id, 'continued conflicted draft')
  expect(useAppStore.getState().saveStates[note.id]).toBe('conflict')
  await useAppStore.getState().flushDraft(note.id)
  expect(window.strata.notes.update).toHaveBeenCalledTimes(2)
})
