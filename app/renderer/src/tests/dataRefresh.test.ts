import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../state/useAppStore'
import { installDataRefresh } from '../state/installDataRefresh'
import { NO_CHANGED, type ChangedDomains } from '@shared/changedDomains'
const initial = useAppStore.getState()
let dispose = () => {}
afterEach(() => {
  dispose()
  useAppStore.setState(initial, true)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('refreshes projects without reloading notes, settings or tags', async () => {
  const projects = [{ id: 'project', name: 'New', createdAt: '', updatedAt: '', sortOrder: 0 }]
  const list = vi.fn(async () => projects)
  const page = vi.fn()
  const tags = vi.fn()
  const settings = vi.fn()
  vi.stubGlobal('window', {
    strata: { projects: { list }, notes: { page }, tags: { list: tags }, settings: { get: settings } },
  })
  await initial.refreshDomains({ ...NO_CHANGED, projects: true })
  expect(useAppStore.getState().projects).toEqual(projects)
  expect(page).not.toHaveBeenCalled()
  expect(tags).not.toHaveBeenCalled()
  expect(settings).not.toHaveBeenCalled()
  await initial.refreshDomains({ ...NO_CHANGED, history: true, links: true })
  expect(useAppStore.getState().historyVersion).toBe(initial.historyVersion + 1)
  expect(useAppStore.getState().linksVersion).toBe(initial.linksVersion + 1)
  expect(list).toHaveBeenCalledTimes(1)
})
it('merges bursts and queues changes that arrive during a refresh', async () => {
  vi.useFakeTimers()
  let emit: (changed: ChangedDomains) => void = () => {}
  let release!: () => void
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  useAppStore.setState({ refreshDomains: refresh })
  const unsubscribe = vi.fn()
  dispose = installDataRefresh((listener) => {
    emit = listener
    return unsubscribe
  })
  emit({ ...NO_CHANGED, notes: true })
  emit({ ...NO_CHANGED, projects: true })
  await vi.advanceTimersByTimeAsync(40)
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(refresh).toHaveBeenLastCalledWith({ ...NO_CHANGED, notes: true, projects: true })
  emit({ ...NO_CHANGED, history: true })
  await vi.advanceTimersByTimeAsync(100)
  expect(refresh).toHaveBeenCalledTimes(1)
  release()
  await vi.advanceTimersByTimeAsync(0)
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(refresh).toHaveBeenLastCalledWith({ ...NO_CHANGED, history: true })
  dispose()
  release()
  await vi.advanceTimersByTimeAsync(0)
  expect(unsubscribe).toHaveBeenCalledOnce()
})
it('surfaces refresh failure and accepts later changes', async () => {
  vi.useFakeTimers()
  let emit: (changed: ChangedDomains) => void = () => {}
  const refresh = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined)
  useAppStore.setState({ refreshDomains: refresh })
  dispose = installDataRefresh((listener) => {
    emit = listener
    return () => {}
  })
  emit({ ...NO_CHANGED, notes: true })
  await vi.advanceTimersByTimeAsync(40)
  expect(useAppStore.getState().retrievalError).toContain('Could not refresh')
  emit({ ...NO_CHANGED, projects: true })
  await vi.advanceTimersByTimeAsync(40)
  expect(refresh).toHaveBeenCalledTimes(2)
})
