// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HistoryStorage } from '../components/HistoryStorage'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'strata')
  vi.unstubAllGlobals()
})
it('requires a preview and explicit removal and invalidates a preview when retention changes', async () => {
  const prune = vi.fn().mockResolvedValue(4)
  const previewPrune = vi.fn().mockResolvedValue({ count: 4, bytes: 1000, fingerprint: 'reviewed-plan' })
  Object.defineProperty(window, 'strata', {
    configurable: true,
    value: {
      history: {
        storage: vi.fn().mockResolvedValue({ revisions: 104, bytes: 10000 }),
        previewPrune,
        prune,
      },
    },
  })
  render(<HistoryStorage />)
  await screen.findByText(/104 revisions/)
  expect(prune).not.toHaveBeenCalled()
  expect(screen.queryByText('Permanently remove 4 old revisions')).toBeNull()
  fireEvent.click(screen.getByText('Preview history cleanup'))
  await screen.findByText('Permanently remove 4 old revisions')
  expect(prune).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } })
  expect(screen.queryByText('Permanently remove 4 old revisions')).toBeNull()
  fireEvent.click(screen.getByText('Preview history cleanup'))
  fireEvent.click(await screen.findByText('Permanently remove 4 old revisions'))
  await waitFor(() => expect(prune).toHaveBeenCalledWith(50, 'reviewed-plan'))
  await screen.findByText('Removed 4 old revisions')
})
