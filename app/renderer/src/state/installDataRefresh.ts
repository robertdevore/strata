import { NO_CHANGED, hasChanges, mergeChanged, type ChangedDomains } from '@shared/changedDomains'
import { useAppStore } from './useAppStore'

/** Coalesce bursts of committed writes and serialize refreshes to avoid stale read races. */
export const installDataRefresh = (
  subscribe: (listener: (changed: ChangedDomains) => void) => () => void,
): (() => void) => {
  let queued = { ...NO_CHANGED }
  let disposed = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const refresh = async () => {
    running = true
    while (!disposed && hasChanges(queued)) {
      const changed = queued
      queued = { ...NO_CHANGED }
      try {
        await useAppStore.getState().refreshDomains(changed)
      } catch {
        useAppStore.setState({
          retrievalError: 'Could not refresh changed data. Retry when the local service is available.',
        })
      }
    }
    running = false
  }
  const unsubscribe = subscribe((changed) => {
    queued = mergeChanged(queued, changed)
    if (running || timer) return
    timer = setTimeout(() => {
      timer = undefined
      void refresh()
    }, 40)
  })
  return () => {
    disposed = true
    clearTimeout(timer)
    unsubscribe()
  }
}
