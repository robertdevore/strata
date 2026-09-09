import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../state/useAppStore'

const initial = useAppStore.getState()
afterEach(() => {
  useAppStore.setState(initial, true)
  vi.unstubAllGlobals()
})

it('requests project-scoped server pages and preserves the filter when loading more', async () => {
  const page = vi
    .fn()
    .mockResolvedValueOnce({ notes: [], nextCursor: 'second-page' })
    .mockResolvedValueOnce({ notes: [], nextCursor: null })
    .mockResolvedValueOnce({ notes: [], nextCursor: null })
  vi.stubGlobal('window', { strata: { notes: { page } } })
  useAppStore.setState({
    ...initial,
    selectedTag: 'evidence',
    activeFilter: 'archived',
    searchQuery: 'decision',
  })
  useAppStore.getState().setSelectedProjectId('project-fixture')
  await vi.waitFor(() => expect(useAppStore.getState().nextCursor).toBe('second-page'))
  expect(page).toHaveBeenLastCalledWith(
    expect.objectContaining({
      projectId: 'project-fixture',
      tag: 'evidence',
      archived: true,
      query: 'decision',
      limit: 100,
    }),
  )
  await useAppStore.getState().refreshListing(true)
  expect(page).toHaveBeenLastCalledWith(
    expect.objectContaining({ projectId: 'project-fixture', cursor: 'second-page' }),
  )
  useAppStore.getState().setSelectedProjectId(null)
  await vi.waitFor(() => expect(page).toHaveBeenCalledTimes(3))
  expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: undefined, cursor: undefined }))
})
