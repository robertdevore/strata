import { useEffect } from 'react'
import type { StrataApi } from '../../../preload/api'
import { useAppStore } from './useAppStore'

export const installDraftCloseProtection = (lifecycle: StrataApi['lifecycle']): (() => void) => {
  let disposed = false
  const enable = () => {
    document.body.inert = false
  }
  const unsubscribePrepare = lifecycle.onPrepareClose((requestId) => {
    document.body.inert = true
    void (async () => {
      try {
        const saved = await useAppStore.getState().prepareToClose()
        if (disposed) return
        const accepted = await lifecycle.finishClose(requestId, saved)
        if (!saved || !accepted) enable()
      } catch {
        enable()
        if (!disposed) await lifecycle.finishClose(requestId, false).catch(() => {})
      }
    })()
  })
  const unsubscribeCancel = lifecycle.onCloseCancelled(enable)
  const beforeUnload = (event: BeforeUnloadEvent) => {
    const state = useAppStore.getState()
    const unsafe = Object.entries(state.drafts).some(([id, draft]) => {
      const note = state.notes.find((item) => item.id === id)
      return (
        state.saveStates[id] === 'conflict' ||
        state.saveStates[id] === 'failed' ||
        !note ||
        note.contentLoaded === false ||
        note.content !== draft
      )
    })
    if (unsafe) {
      event.preventDefault()
      // Electron requires an explicit returnValue to cancel native unload.
      event.returnValue = false as unknown as string
    }
  }
  window.addEventListener('beforeunload', beforeUnload)
  void lifecycle.ready().catch(() => {})
  return () => {
    disposed = true
    enable()
    unsubscribePrepare()
    unsubscribeCancel()
    window.removeEventListener('beforeunload', beforeUnload)
  }
}

export function useDraftCloseProtection(): void {
  useEffect(() => installDraftCloseProtection(window.strata.lifecycle), [])
}
