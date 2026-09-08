// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DraftConflict } from '../components/KnowledgeStatus'
import { useAppStore } from '../state/useAppStore'
const initial = useAppStore.getState()
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
})
it('recovers the conflicted pane even when another note is selected', async () => {
  const resolve = vi.fn().mockResolvedValue(undefined)
  useAppStore.setState({
    selectedNoteId: 'selected',
    saveStates: { pinned: 'conflict', selected: 'saved' },
    resolveConflict: resolve,
  })
  render(
    <>
      <DraftConflict noteId="pinned" />
      <DraftConflict noteId="selected" />
    </>,
  )
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  fireEvent.click(screen.getByText('Save draft as new note and reload'))
  await waitFor(() => expect(resolve).toHaveBeenCalledWith('pinned', true))
})
