import { afterEach, expect, it, vi } from 'vitest'
import { DraftCloseGuard } from '../../../main/lifecycle/draftCloseGuard'

const fixture = (discard = false) => {
  const options = {
    requestSave: vi.fn(),
    confirmDiscard: vi.fn(async () => discard),
    complete: vi.fn(),
    cancelled: vi.fn(),
    timeoutMs: 20,
  }
  const guard = new DraftCloseGuard(options)
  guard.ready = true
  const event = { preventDefault: vi.fn() }
  return { guard, event, ...options }
}
afterEach(() => vi.useRealTimers())
it('waits for an acknowledged save and combines close/quit requests', async () => {
  const f = fixture()
  const first = f.guard.intercept(f.event)
  expect(f.guard.intercept(f.event, true)).toBe(first)
  expect(f.complete).not.toHaveBeenCalled()
  expect(f.requestSave).toHaveBeenCalledTimes(1)
  expect(f.guard.reply('unknown', true)).toBe(false)
  f.guard.reply(f.requestSave.mock.calls[0][0], true)
  await first
  expect(f.complete).toHaveBeenCalledWith(true)
  expect(f.confirmDiscard).not.toHaveBeenCalled()
  expect(f.guard.intercept(f.event)).toBeUndefined()
})
it.each([false, true])(
  'requires explicit discard approval after unsuccessful saving: %s',
  async (discard) => {
    const f = fixture(discard)
    const attempt = f.guard.intercept(f.event)
    f.guard.reply(f.requestSave.mock.calls[0][0], false)
    await attempt
    expect(f.guard.approved).toBe(discard)
    expect(f.complete).toHaveBeenCalledTimes(discard ? 1 : 0)
    expect(f.cancelled).toHaveBeenCalledTimes(discard ? 0 : 1)
  },
)
it('times out safely and rejects late acknowledgements', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const attempt = f.guard.intercept(f.event)
  const id = f.requestSave.mock.calls[0][0]
  await vi.advanceTimersByTimeAsync(21)
  await attempt
  expect(f.cancelled).toHaveBeenCalledOnce()
  expect(f.guard.reply(id, true)).toBe(false)
  expect(f.complete).not.toHaveBeenCalled()
})
it('cannot close a replacement window from an old attempt', async () => {
  const f = fixture(true)
  const attempt = f.guard.intercept(f.event)
  const id = f.requestSave.mock.calls[0][0]
  f.guard.reset()
  f.guard.ready = true
  await attempt
  expect(f.guard.reply(id, true)).toBe(false)
  expect(f.complete).not.toHaveBeenCalled()
  expect(f.confirmDiscard).not.toHaveBeenCalled()
})
it('keeps the window open if confirmation fails', async () => {
  const f = fixture()
  f.confirmDiscard.mockRejectedValueOnce(new Error('dialog unavailable'))
  const attempt = f.guard.intercept(f.event)
  f.guard.reply(f.requestSave.mock.calls[0][0], false)
  await attempt
  expect(f.guard.approved).toBe(false)
  expect(f.complete).not.toHaveBeenCalled()
  expect(f.cancelled).toHaveBeenCalledOnce()
})
