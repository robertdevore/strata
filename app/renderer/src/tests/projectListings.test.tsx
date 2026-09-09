// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useProjectListings } from '../hooks/useProjectListings'
import { useAppStore } from '../state/useAppStore'
import type { Note } from '@shared/types'
const initial = useAppStore.getState()
const note = (id: string): Note => ({
  id,
  content: '# Project note',
  title: 'Project note',
  contentLoaded: false,
  revision: 1,
  tags: [],
  starred: false,
  archived: false,
  deletedAt: null,
  projectId: 'project',
  createdAt: '',
  updatedAt: '',
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.unstubAllGlobals()
})
it('loads uncached project notes independently, pages by cursor and preserves hydrated drafts', async () => {
  const page = vi
    .fn()
    .mockResolvedValueOnce({ notes: [note('one')], nextCursor: 'next' })
    .mockResolvedValueOnce({ notes: [note('two')], nextCursor: null })
  vi.stubGlobal('strata', { notes: { page } })
  const hydrated = { ...note('one'), content: 'unsaved local content', contentLoaded: true }
  useAppStore.setState({
    notes: [hydrated],
    listingIds: ['global'],
    nextCursor: 'global-cursor',
    drafts: { one: 'draft' },
  })
  const { result } = renderHook(() => useProjectListings(['project'], { query: 'match', archived: false }, 0))
  await waitFor(() => expect(result.current.pages.project?.notes).toHaveLength(1))
  expect(page).toHaveBeenCalledWith({ projectId: 'project', query: 'match', archived: false, limit: 6 })
  await act(() => result.current.more('project'))
  expect(result.current.pages.project.notes.map((n) => n.id)).toEqual(['one', 'two'])
  expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next', limit: 6 }))
  expect(useAppStore.getState().notes.find((n) => n.id === 'one')).toEqual(hydrated)
  expect(useAppStore.getState().listingIds).toEqual(['global'])
  expect(useAppStore.getState().nextCursor).toBe('global-cursor')
})
it('discards responses after a project closes or its query changes', async () => {
  const pending: Array<(value: { notes: Note[]; nextCursor: null }) => void> = []
  vi.stubGlobal('strata', { notes: { page: vi.fn(() => new Promise((resolve) => pending.push(resolve))) } })
  const { result, rerender } = renderHook(({ query, ids }) => useProjectListings(ids, { query }, 0), {
    initialProps: { query: 'old', ids: ['project'] },
  })
  rerender({ query: 'new', ids: ['project'] })
  await act(async () => pending[1]({ notes: [note('new')], nextCursor: null }))
  await act(async () => pending[0]({ notes: [note('old')], nextCursor: null }))
  expect(result.current.pages.project.notes[0].id).toBe('new')
  expect(useAppStore.getState().notes.some((n) => n.id === 'old')).toBe(false)
  rerender({ query: 'new', ids: [] })
  expect(result.current.pages).toEqual({})
})
