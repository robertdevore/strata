import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { StrataDatabase } from '@main/db'
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  run: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(name, handler),
  },
}))
vi.mock('@main/ai/aiRunner', () => ({
  run_ai_turn: mocks.run,
  derive_chat_title: () => 'Chat',
  resolve_ai_settings: () => ({ openAiApiKey: 'fixture-key' }),
}))
import { registerAiHandlers } from '@main/ipc/aiHandlers'
import { IPC_CHANNELS } from '@shared/ipc'
import { configureTrustedIpc } from '@main/security/trustedIpc'
afterEach(() => vi.unstubAllGlobals())
const requestId = '00000000-0000-4000-8000-000000000002'
beforeEach(() => {
  mocks.run.mockReset()
  mocks.handlers.clear()
})
const fixture = () => {
  const thread = { id: '00000000-0000-4000-8000-000000000001', title: 'Chat', model: '' }
  let deleted = false
  const createAiMessage = vi.fn((_id, role, content) => ({ role, content }))
  const db = {
    getSettings: () => ({ aiRoutingMode: 'auto' }),
    getAiThread: () => (deleted ? null : thread),
    deleteAiThread: () => {
      deleted = true
      return true
    },
    createAiMessage,
  } as unknown as StrataDatabase
  const frame = { url: 'file:///test/index.html' }
  let destroyed = false
  const sender = Object.assign(new EventEmitter(), { id: 1, mainFrame: frame, isDestroyed: () => destroyed })
  configureTrustedIpc(() => sender as unknown as Electron.WebContents, frame.url)
  const event = { sender, senderFrame: frame }
  registerAiHandlers(db)
  return {
    createAiMessage,
    deleteThread: () => mocks.handlers.get(IPC_CHANNELS.aiThreadDelete)!(event, { threadId: thread.id }),
    sender,
    send: () =>
      mocks.handlers.get(IPC_CHANNELS.aiSendMessage)!(event, {
        requestId,
        threadId: thread.id,
        message: 'hello',
      }) as Promise<import('@shared/types').AiChatResponse>,
    cancel: () => mocks.handlers.get(IPC_CHANNELS.aiCancelRequest)!(event, { requestId }),
    transcribe: () =>
      mocks.handlers.get(IPC_CHANNELS.aiTranscribeAudio)!(event, {
        requestId,
        base64Audio: 'aGVsbG8=',
        mimeType: 'audio/webm',
      }) as Promise<unknown>,
    destroy: () => {
      destroyed = true
      sender.emit('destroyed')
    },
  }
}
it('cancels during runner loading before recording a message or contacting a provider', async () => {
  const f = fixture()
  const request = f.send()
  expect(f.cancel()).toBe(true)
  await expect(request).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(mocks.run).not.toHaveBeenCalled()
  expect(f.createAiMessage).not.toHaveBeenCalled()
  expect(f.cancel()).toBe(false)
  expect(f.sender.listenerCount('destroyed')).toBe(0)
})
it('returns a persisted cancellation status and releases the request after it settles', async () => {
  const f = fixture()
  mocks.run.mockImplementation(
    (_db, _thread, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(new Error('private abort detail'))),
      ),
  )
  const request = f.send()
  await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledOnce())
  expect(f.cancel()).toBe(true)
  const result = await request
  expect(result.cancelled).toBe(true)
  expect(result.message.content).toContain('Request cancelled')
  expect(result.message.content).not.toContain('private abort detail')
  expect(f.createAiMessage).toHaveBeenCalledTimes(2)
  expect(f.cancel()).toBe(false)
  expect(f.sender.listenerCount('destroyed')).toBe(0)
})
it('aborts requests when the renderer is destroyed without writing after destruction', async () => {
  const f = fixture()
  mocks.run.mockImplementation(
    (_db, _thread, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(new Error('aborted'))),
      ),
  )
  const request = f.send()
  const outcome = request.then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledOnce())
  f.destroy()
  expect(await outcome).toMatchObject({ error: { code: 'CANCELLED' } })
  expect(f.createAiMessage).toHaveBeenCalledTimes(1)
  expect(f.cancel()).toBe(false)
  expect(f.sender.listenerCount('destroyed')).toBe(0)
})

it('cancels transcription through the same owner-scoped request contract', async () => {
  const f = fixture()
  const fetch = vi.fn(
    (_url, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new Error('private transport detail')))
      }),
  )
  vi.stubGlobal('fetch', fetch)
  const request = f.transcribe()
  const outcome = request.then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  expect(f.cancel()).toBe(true)
  expect(await outcome).toMatchObject({ error: { code: 'CANCELLED' } })
  expect(f.cancel()).toBe(false)
  expect(f.sender.listenerCount('destroyed')).toBe(0)
})

it('aborts an active chat when its conversation is deleted without writing a late reply', async () => {
  const f = fixture()
  mocks.run.mockImplementation(
    (_db, _thread, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('cancelled')))
      }),
  )
  const request = f.send()
  const rejected = expect(request).rejects.toMatchObject({ code: 'CANCELLED' })
  await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1))
  expect(f.deleteThread()).toBe(true)
  await rejected
  expect(f.createAiMessage).toHaveBeenCalledTimes(1)
  expect(f.cancel()).toBe(false)
})
