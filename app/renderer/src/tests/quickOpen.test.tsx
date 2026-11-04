// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CommandPalette } from '../components/CommandPalette'
import { useAppStore } from '../state/useAppStore'
const initial = useAppStore.getState()
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'strata')
})
const note = {
  id: 'outside-page',
  revision: 1,
  content: '# Beyond sidebar',
  title: 'Beyond sidebar',
  contentLoaded: true,
  tags: [],
  starred: false,
  archived: false,
  deletedAt: null,
  projectId: null,
  createdAt: '',
  updatedAt: '',
}
const setup = (page: unknown, get = vi.fn().mockResolvedValue(note)) => {
  Object.defineProperty(window, 'strata', { configurable: true, value: { notes: { page, get } } })
  Element.prototype.scrollIntoView = vi.fn()
  const close = vi.fn()
  render(
    <CommandPalette
      mode="quick-open"
      selectedNoteId={null}
      onClose={close}
      onOpenNote={async (id) => {
        await useAppStore.getState().ensureNote(id)
      }}
      onRunCommand={vi.fn()}
      onTogglePreview={vi.fn()}
      onToggleChatPanel={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  )
  return { close, get }
}
it('queries bounded summaries and loads a selected note outside the sidebar cache', async () => {
  const page = vi.fn().mockResolvedValue({ notes: [note], nextCursor: null })
  const { close, get } = setup(page)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Beyond' } })
  fireEvent.click(await screen.findByText('Beyond sidebar'))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(page).toHaveBeenLastCalledWith({ query: 'Beyond', limit: 30 })
  expect(get).toHaveBeenCalledWith(note.id)
  expect(useAppStore.getState().notes).toContainEqual(note)
})
it('ignores a late result from an earlier query and preserves the palette on failed opens', async () => {
  let resolveOld!: (value: unknown) => void
  const page = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    .mockResolvedValue({ notes: [note] })
  const { close } = setup(page, vi.fn().mockResolvedValue(null))
  await waitFor(() => expect(page).toHaveBeenCalledOnce())
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Beyond' } })
  await screen.findByText('Beyond sidebar')
  await act(async () => resolveOld({ notes: [{ ...note, title: 'Stale result' }] }))
  expect(screen.queryByText('Stale result')).toBeNull()
  fireEvent.click(screen.getByText('Beyond sidebar'))
  await screen.findByRole('alert')
  expect(close).not.toHaveBeenCalled()
})

it('keeps the results region mounted while searching and prevents opening stale matches', async () => {
  let resolveSearch!: (value: unknown) => void
  const page = vi
    .fn()
    .mockResolvedValueOnce({ notes: [note] })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve
        }),
    )
  const { get } = setup(page)
  await screen.findByText('Beyond sidebar')
  const results = screen.getByText('Beyond sidebar').closest('.palette-results')
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'missing' } })
  expect(screen.getByRole('status', { name: 'Searching notes' }).parentElement).toBe(results)
  expect(results?.getAttribute('aria-busy')).toBe('true')
  expect(screen.queryByText('Beyond sidebar')).toBeNull()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(get).not.toHaveBeenCalled()
  await waitFor(() => expect(page).toHaveBeenCalledTimes(2))
  await act(async () => resolveSearch({ notes: [] }))
  expect(screen.getByText('No results').parentElement).toBe(results)
  expect(results?.getAttribute('aria-busy')).toBe('false')
  expect(screen.queryByRole('status')).toBeNull()
})
