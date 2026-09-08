// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { installDraftCloseProtection } from '../state/useDraftCloseProtection'
import { useAppStore } from '../state/useAppStore'
import type { Note } from '@shared/types'
const initial = useAppStore.getState()
let cleanup = () => {}
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
})
const note: Note = {
  id: 'one',
  revision: 1,
  content: 'saved',
  contentLoaded: true,
  tags: [],
  starred: false,
  archived: false,
  deletedAt: null,
  projectId: null,
  createdAt: '',
  updatedAt: '',
}
function setup() {
  let prepare = (id: string) => {
    void id
  }
  let cancel = () => {}
  const lifecycle = {
    ready: vi.fn(async () => {}),
    finishClose: vi.fn(async (id: string, saved: boolean) => {
      void id
      void saved
      return true
    }),
    onPrepareClose: (callback: typeof prepare) => {
      prepare = callback
      return vi.fn()
    },
    onCloseCancelled: (callback: typeof cancel) => {
      cancel = callback
      return vi.fn()
    },
  }
  cleanup = installDraftCloseProtection(lifecycle)
  return { lifecycle, prepare: (id: string) => prepare(id), cancel: () => cancel() }
}
it('disables editing until saves finish and restores editing after cancellation', async () => {
  let finish!: (saved: boolean) => void
  useAppStore.setState({
    prepareToClose: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  const f = setup()
  f.prepare('request')
  expect(document.body.inert).toBe(true)
  expect(f.lifecycle.finishClose).not.toHaveBeenCalled()
  finish(true)
  await vi.waitFor(() => expect(f.lifecycle.finishClose).toHaveBeenCalledWith('request', true))
  expect(document.body.inert).toBe(true)
  f.cancel()
  expect(document.body.inert).toBe(false)
})
it.each([false, true])(
  'restores editing after a failed save or expired acknowledgement: %s',
  async (saved) => {
    useAppStore.setState({ prepareToClose: async () => saved })
    const f = setup()
    f.lifecycle.finishClose.mockResolvedValue(false)
    f.prepare('expired')
    await vi.waitFor(() => expect(document.body.inert).toBe(false))
  },
)
it('blocks reload for dirty or conflicting drafts, but not identical saved content', () => {
  setup()
  useAppStore.setState({ notes: [note], drafts: { one: 'changed' } })
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }
  expect(unload()).toBe(true)
  useAppStore.setState({ drafts: { one: 'saved' } })
  expect(unload()).toBe(false)
  useAppStore.setState({ saveStates: { one: 'conflict' } })
  expect(unload()).toBe(true)
  cleanup()
  expect(unload()).toBe(false)
})
it('flushes every draft and refuses approval if any draft survives', async () => {
  const flushDraft = vi.fn(async (id: string) => {
    if (id === 'one') useAppStore.setState({ drafts: { two: 'conflicting' } })
  })
  useAppStore.setState({ drafts: { one: 'changed', two: 'conflicting' }, flushDraft })
  expect(await initial.prepareToClose()).toBe(false)
  expect(flushDraft.mock.calls).toEqual([['one'], ['two']])
  useAppStore.setState({ drafts: {} })
  expect(await initial.prepareToClose()).toBe(true)
})
