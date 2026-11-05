// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Sidebar } from '../components/Sidebar'
import { useAppStore } from '../state/useAppStore'
import { DEFAULT_SIDEBAR_LAYOUT } from '@shared/sidebarLayout'

const initial = useAppStore.getState()
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.unstubAllGlobals()
})
const setup = (selectedProjectId: string | null = null) => {
  const page = vi.fn().mockResolvedValue({ notes: [], nextCursor: null })
  vi.stubGlobal('strata', { notes: { page } })
  const props: ComponentProps<typeof Sidebar> = {
    notes: [],
    projects: [{ id: 'alpha', name: 'Alpha', sortOrder: 0, createdAt: '', updatedAt: '' }],
    selectedId: null,
    activeFilter: 'all',
    selectedTag: null,
    selectedProjectId,
    searchQuery: '',
    tags: [],
    showFiltersPanel: false,
    sidebarCollapsed: false,
    pinnedTags: [],
    pinnedNotes: [],
    undoDeleteTitle: null,
    theme: 'light',
    sidebarLayout: DEFAULT_SIDEBAR_LAYOUT,
    onProjectFilter: vi.fn(),
    onSearchChange: vi.fn(),
    onSelect: vi.fn(),
    onNewNote: vi.fn(),
    onOpenSettings: vi.fn(),
    onThemeToggle: vi.fn(),
    onToggleSidebar: vi.fn(),
    onOpenTagsModal: vi.fn(),
    onFilterChange: vi.fn(),
    onTagFilter: vi.fn(),
    onStarToggle: vi.fn(),
    onArchiveToggle: vi.fn(),
    onDelete: vi.fn(),
    onSetNoteProject: vi.fn(),
    onPinTag: vi.fn(),
    onUnpinTag: vi.fn(),
    onReorderPinned: vi.fn(),
    onPinNote: vi.fn(),
    onUnpinNote: vi.fn(),
    onReorderPinnedNotes: vi.fn(),
    onUndoDelete: vi.fn(),
  }
  const view = render(<Sidebar {...props} />)
  return { page, search: (query: string) => view.rerender(<Sidebar {...props} searchQuery={query} />) }
}
const project = () => screen.getByRole('button', { name: /^Alpha/ })
it('keeps projects collapsed by default when searching, and lets users open and close them', async () => {
  const { page, search } = setup()
  expect(project().getAttribute('aria-expanded')).toBe('false')
  search('word')
  expect(project().getAttribute('aria-expanded')).toBe('false')
  expect(page).not.toHaveBeenCalled()
  fireEvent.click(project())
  await waitFor(() =>
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'alpha', query: 'word' })),
  )
  // Even an empty result must leave the header available for collapsing.
  await screen.findByText('No notes match the current filters.')
  expect(project().getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(project())
  expect(project().getAttribute('aria-expanded')).toBe('false')
  search('another')
  search('')
  expect(project().getAttribute('aria-expanded')).toBe('false')
})
it('preserves an explicitly opened project across search changes and respects a later collapse', () => {
  const { search } = setup()
  fireEvent.click(project())
  search('word')
  expect(project().getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(project())
  search('another')
  expect(project().getAttribute('aria-expanded')).toBe('false')
})
it('allows collapsing a selected project instead of forcing it open', () => {
  const { search } = setup('alpha')
  expect(project().getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(project())
  search('word')
  expect(project().getAttribute('aria-expanded')).toBe('false')
})
