import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../state/useAppStore'
import type { Note } from '@shared/types'
const initial = useAppStore.getState()
const current: Note = {
  id: 'current',
  revision: 1,
  content: 'saved',
  contentLoaded: true,
  tags: [],
  starred: false,
  archived: false,
  deletedAt: null,
  projectId: null,
  createdAt: '',
  updatedAt: '',
}
const target = { ...current, id: 'target', content: 'outside cache' }
afterEach(() => {
  useAppStore.setState(initial, true)
  vi.unstubAllGlobals()
})
function setup(get: unknown = vi.fn().mockResolvedValue(target)) {
  vi.stubGlobal('window', { strata: { notes: { get } } })
  useAppStore.setState({ ...initial, notes: [current], selectedNoteId: current.id, openTabs: [current.id] })
}
it('loads an uncached linked note before opening a new tab', async () => {
  setup()
  expect(await useAppStore.getState().navigateToNote(target.id, true)).toBe(true)
  expect(useAppStore.getState().selectedNote()).toEqual(target)
  expect(useAppStore.getState().openTabs).toEqual([current.id, target.id])
})
it('keeps the current selection and draft when saving fails', async () => {
  setup()
  useAppStore.setState({
    drafts: { current: 'unsaved work' },
    flushDraft: vi.fn().mockResolvedValue(undefined),
  })
  expect(await useAppStore.getState().navigateToNote(target.id)).toBe(false)
  expect(useAppStore.getState().selectedNoteId).toBe(current.id)
  expect(useAppStore.getState().drafts.current).toBe('unsaved work')
  expect(useAppStore.getState().navigationError).toContain('preserved')
})
it('does not switch selection when an older retrieval completes late', async () => {
  let finish!: (note: Note) => void
  setup(
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValue({ ...target, id: 'new-target' }),
  )
  const older = useAppStore.getState().navigateToNote(target.id)
  expect(await useAppStore.getState().navigateToNote('new-target')).toBe(true)
  finish(target)
  expect(await older).toBe(false)
  expect(useAppStore.getState().selectedNoteId).toBe('new-target')
})
it('reports missing notes without changing selection', async () => {
  setup(vi.fn().mockResolvedValue(null))
  expect(await useAppStore.getState().navigateToNote(target.id)).toBe(false)
  expect(useAppStore.getState().selectedNoteId).toBe(current.id)
  expect(useAppStore.getState().navigationError).not.toBeNull()
})
it('retains the destination if the sidebar refreshes while saving the current note', async () => {
  setup()
  vi.stubGlobal('window', {
    strata: {
      notes: {
        get: vi.fn().mockResolvedValue(target),
        page: vi.fn().mockResolvedValue({ notes: [current], nextCursor: null }),
      },
    },
  })
  useAppStore.setState({
    flushDraft: async () => {
      await useAppStore.getState().refreshListing()
    },
  })
  expect(await useAppStore.getState().navigateToNote(target.id)).toBe(true)
  expect(useAppStore.getState().selectedNote()).toEqual(target)
})
