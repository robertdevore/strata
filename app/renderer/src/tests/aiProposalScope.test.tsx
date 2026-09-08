// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AiProposals } from '../components/AiProposals'
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'strata')
})
const proposal = (id: string) => ({
  id,
  createdAt: '',
  payload: { operation: { op: 'create_note' }, before: null, after: { content: id } },
})
it('scopes reads to the active chat and ignores a delayed result from the previous chat', async () => {
  const pending: Array<(value: ReturnType<typeof proposal>[]) => void> = []
  const listProposals = vi.fn(
    () => new Promise<ReturnType<typeof proposal>[]>((resolve) => pending.push(resolve)),
  )
  Object.defineProperty(window, 'strata', { configurable: true, value: { ai: { listProposals } } })
  const view = render(<AiProposals sending={false} threadId="first" />)
  view.rerender(<AiProposals sending={false} threadId="second" />)
  await act(async () => pending[1]([proposal('second proposal')]))
  expect(screen.getAllByText(/second proposal/)[0]).toBeTruthy()
  await act(async () => pending[0]([proposal('first proposal')]))
  expect(screen.queryAllByText(/first proposal/)).toHaveLength(0)
  expect(listProposals.mock.calls).toEqual([['first'], ['second']])
  view.rerender(<AiProposals sending={false} threadId={null} />)
  expect(screen.queryAllByText(/second proposal/)).toHaveLength(0)
  expect(listProposals).toHaveBeenCalledTimes(2)
})
it('does not carry an approval failure into another conversation', async () => {
  let reject!: (error: Error) => void
  const resolveProposal = vi.fn(
    () =>
      new Promise((_, fail) => {
        reject = fail
      }),
  )
  const listProposals = vi.fn().mockImplementation(async (id) => [proposal(id)])
  Object.defineProperty(window, 'strata', {
    configurable: true,
    value: { ai: { listProposals, resolveProposal } },
  })
  const view = render(<AiProposals sending={false} threadId="first" />)
  fireEvent.click(await screen.findByText('Approve edit'))
  view.rerender(<AiProposals sending={false} threadId="second" />)
  await screen.findByText(/"second"/)
  await act(async () => reject(new Error('conflict')))
  expect(screen.queryByRole('alert')).toBeNull()
  expect((screen.getByText('Approve edit') as HTMLButtonElement).disabled).toBe(false)
})
it('shows a failed proposal load in the current conversation', async () => {
  Object.defineProperty(window, 'strata', {
    configurable: true,
    value: { ai: { listProposals: vi.fn().mockRejectedValue(new Error('offline')) } },
  })
  render(<AiProposals sending={false} threadId="first" />)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not load pending edits')
})
it('does not reinsert a resolved proposal from an older refresh', async () => {
  let finish!: (items: ReturnType<typeof proposal>[]) => void
  const item = proposal('first')
  const listProposals = vi
    .fn()
    .mockResolvedValueOnce([item])
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
  Object.defineProperty(window, 'strata', {
    configurable: true,
    value: { ai: { listProposals, resolveProposal: vi.fn().mockResolvedValue(null) } },
  })
  const view = render(<AiProposals sending={true} threadId="first" />)
  await screen.findByText('Reject')
  view.rerender(<AiProposals sending={false} threadId="first" />)
  await act(async () => fireEvent.click(screen.getByText('Reject')))
  expect(screen.queryByText('Reject')).toBeNull()
  await act(async () => finish([item]))
  expect(screen.queryByText('Reject')).toBeNull()
})
