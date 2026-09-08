import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
    openTabs: [note.id],
    selectedNoteId: note.id,
    drafts: {},
  }),
)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each([6, 7])('distinguishes an own-write echo from a newer observed revision %i', async (revision) => {
  let finish!: (value: Note) => void
  vi.stubGlobal('window', {
    strata: {
      notes: {
        update: vi.fn(
          () =>
            new Promise<Note>((resolve) => {
              finish = resolve
            }),
        ),
        page: vi.fn().mockResolvedValue({
          notes: [{ ...note, revision, contentLoaded: false, content: 'Server summary' }],
          nextCursor: null,
        }),
      },
    },
  })
  useAppStore.getState().setDraft(note.id, 'Local saved content')
  const saving = useAppStore.getState().flushDraft(note.id)
  await useAppStore.getState().refreshListing()
  finish({ ...note, revision: 6, content: 'Local saved content' })
  await saving
  const state = useAppStore.getState()
  if (revision === 7) {
    expect(state.saveStates[note.id]).toBe('conflict')
    expect(state.drafts[note.id]).toBe('Local saved content')
    expect(state.notes[0].revision).toBe(5)
  } else {
    expect(state.saveStates[note.id]).toBe('saved')
    expect(state.drafts[note.id]).toBeUndefined()
    expect(state.notes[0].revision).toBe(6)
  }
})

it.each([6, 7])('preserves a recovered note at revision %i when a save is acknowledged', async (revision) => {
  let finish!: (value: Note) => void
  vi.stubGlobal('window', {
    strata: {
      notes: {
        update: vi.fn(
          () =>
            new Promise<Note>((resolve) => {
              finish = resolve
            }),
        ),
      },
    },
  })
  useAppStore.getState().setDraft(note.id, 'Old local content')
  const saving = useAppStore.getState().flushDraft(note.id)
  const recoveredContent = revision === 6 ? 'Old local content' : 'Latest recovered content'
  useAppStore.setState({
    notes: [{ ...note, revision, content: recoveredContent }],
    drafts: {},
    saveStates: { [note.id]: 'saved' },
  })
  finish({ ...note, revision: 6, content: 'Old local content' })
  await saving
  expect(useAppStore.getState().notes[0]).toMatchObject({ revision, content: recoveredContent })
  expect(useAppStore.getState().saveStates[note.id]).toBe('saved')
})

it('ignores older summaries and full reads instead of regressing or inventing a conflict', async () => {
  vi.stubGlobal('window', {
    strata: {
      projects: { list: vi.fn().mockResolvedValue([]) },
      tags: { list: vi.fn().mockResolvedValue([]) },
      settings: { get: vi.fn().mockResolvedValue(initial.settings) },
      notes: {
        page: vi.fn().mockResolvedValue({ notes: [{ ...note, contentLoaded: false }], nextCursor: null }),
        get: vi.fn().mockResolvedValue(note),
      },
    },
  })
  useAppStore.setState({ notes: [{ ...note, revision: 6, content: 'Current body' }] })
  await useAppStore.getState().refreshListing()
  expect(useAppStore.getState().notes[0]).toMatchObject({ revision: 6, content: 'Current body' })
  useAppStore.getState().setDraft(note.id, 'New draft')
  await useAppStore.getState().load()
  expect(useAppStore.getState().notes[0].revision).toBe(6)
  expect(useAppStore.getState().drafts[note.id]).toBe('New draft')
  expect(useAppStore.getState().saveStates[note.id]).toBe('unsaved')
})

it('ignores a stale metadata result after a newer note has been loaded', async () => {
  let finish!: (value: Note) => void
  vi.stubGlobal('window', {
    strata: {
      notes: {
        star: vi.fn(
          () =>
            new Promise<Note>((resolve) => {
              finish = resolve
            }),
        ),
      },
    },
  })
  const starring = useAppStore.getState().toggleStar(note.id)
  useAppStore.setState({ notes: [{ ...note, revision: 7, starred: false, content: 'Newer body' }] })
  finish({ ...note, revision: 6, starred: true })
  await starring
  expect(useAppStore.getState().notes[0]).toMatchObject({
    revision: 7,
    starred: false,
    content: 'Newer body',
  })
})

it('preserves a newer external revision observed outside the current result page', async () => {
  let finish!: (value: Note) => void
  vi.stubGlobal('window', {
    strata: {
      projects: { list: vi.fn().mockResolvedValue([]) },
      tags: { list: vi.fn().mockResolvedValue([]) },
      settings: { get: vi.fn().mockResolvedValue(initial.settings) },
      notes: {
        page: vi.fn().mockResolvedValue({ notes: [], nextCursor: null }),
        get: vi.fn().mockResolvedValue({ ...note, revision: 7, content: 'External' }),
        update: vi.fn(
          () =>
            new Promise<Note>((resolve) => {
              finish = resolve
            }),
        ),
      },
    },
  })
  useAppStore.getState().setDraft(note.id, 'Local content')
  const saving = useAppStore.getState().flushDraft(note.id)
  await useAppStore.getState().load()
  finish({ ...note, revision: 6, content: 'Local content' })
  await saving
  expect(useAppStore.getState().drafts[note.id]).toBe('Local content')
  expect(useAppStore.getState().saveStates[note.id]).toBe('conflict')
})

it('does not restore a stale failure state after the user has recovered the note', async () => {
  let fail!: (error: Error) => void
  vi.stubGlobal('window', {
    strata: {
      notes: {
        update: vi.fn(
          () =>
            new Promise<Note>((_resolve, reject) => {
              fail = reject
            }),
        ),
      },
    },
  })
  useAppStore.getState().setDraft(note.id, 'Old draft')
  const saving = useAppStore.getState().flushDraft(note.id)
  useAppStore.setState({ notes: [{ ...note, revision: 6 }], drafts: {}, saveStates: { [note.id]: 'saved' } })
  fail(new Error('REVISION_CONFLICT'))
  await saving
  expect(useAppStore.getState().saveStates[note.id]).toBe('saved')
})

it.each([false, true])('handles external deletion with dirty=%s without losing draft text', async (dirty) => {
  vi.stubGlobal('window', {
    strata: {
      projects: { list: vi.fn().mockResolvedValue([]) },
      tags: { list: vi.fn().mockResolvedValue([]) },
      settings: { get: vi.fn().mockResolvedValue(initial.settings) },
      notes: {
        page: vi.fn().mockResolvedValue({ notes: [], nextCursor: null }),
        get: vi.fn().mockResolvedValue({ ...note, revision: 6, deletedAt: '2026-09-08T01:00:00Z' }),
      },
    },
  })
  if (dirty) useAppStore.getState().setDraft(note.id, 'Preserve after external deletion')
  await useAppStore.getState().load()
  if (dirty) {
    expect(useAppStore.getState().drafts[note.id]).toBe('Preserve after external deletion')
    expect(useAppStore.getState().saveStates[note.id]).toBe('conflict')
    expect(useAppStore.getState().notes[0].revision).toBe(5)
  } else {
    expect(useAppStore.getState().notes).toEqual([])
    expect(useAppStore.getState().openTabs).toEqual([])
    expect(useAppStore.getState().selectedNoteId).toBeNull()
  }
})

it.each([false, true])('preserves typing during recovery with saveCopy=%s', async (saveCopy) => {
  let finish!: (value: Note) => void
  const latest = { ...note, revision: 6, content: 'External' }
  const get = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Note>((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValue(latest)
  const create = vi.fn().mockResolvedValue({ ...note, id: 'copy-id', content: 'First draft' })
  vi.stubGlobal('window', {
    strata: {
      projects: { list: vi.fn().mockResolvedValue([]) },
      tags: { list: vi.fn().mockResolvedValue([]) },
      settings: { get: vi.fn().mockResolvedValue(initial.settings) },
      notes: { create, get, page: vi.fn().mockResolvedValue({ notes: [latest], nextCursor: null }) },
    },
  })
  useAppStore.setState({ drafts: { [note.id]: 'First draft' }, saveStates: { [note.id]: 'conflict' } })
  const recovery = useAppStore.getState().resolveConflict(note.id, saveCopy)
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))
  useAppStore.getState().setDraft(note.id, 'New text during recovery')
  finish(latest)
  await recovery
  expect(useAppStore.getState().drafts[note.id]).toBe('New text during recovery')
  expect(useAppStore.getState().saveStates[note.id]).toBe('conflict')
  if (saveCopy) expect(create).toHaveBeenCalledWith({ content: 'First draft', tags: ['recovered-draft'] })
  else expect(create).not.toHaveBeenCalled()
})

it('does not replace a newer cached note with a delayed recovery read', async () => {
  let finish!: (value: Note) => void
  const older = { ...note, revision: 6, content: 'Older read' }
  const get = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Note>((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValue(older)
  vi.stubGlobal('window', {
    strata: {
      projects: { list: vi.fn().mockResolvedValue([]) },
      tags: { list: vi.fn().mockResolvedValue([]) },
      settings: { get: vi.fn().mockResolvedValue(initial.settings) },
      notes: { get, page: vi.fn().mockResolvedValue({ notes: [older], nextCursor: null }) },
    },
  })
  useAppStore.setState({ drafts: { [note.id]: 'Old draft' }, saveStates: { [note.id]: 'conflict' } })
  const recovery = useAppStore.getState().resolveConflict(note.id, false)
  useAppStore.setState({ notes: [{ ...note, revision: 7, content: 'Newest known note' }] })
  finish(older)
  await recovery
  expect(useAppStore.getState().notes[0]).toMatchObject({ revision: 7, content: 'Newest known note' })
  expect(useAppStore.getState().drafts[note.id]).toBeUndefined()
})
