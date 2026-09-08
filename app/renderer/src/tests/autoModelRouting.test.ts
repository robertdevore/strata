import { expect, it, vi } from 'vitest'
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
vi.mock('@main/ai/aiRunner', () => ({ run_ai_turn: mocks.run, derive_chat_title: () => 'Chat' }))
import { registerAiHandlers } from '@main/ipc/aiHandlers'
import { IPC_CHANNELS } from '@shared/ipc'

it('leaves Auto unforced and preserves an explicit provider-qualified selection', async () => {
  const thread = { id: '00000000-0000-4000-8000-000000000001', title: 'Chat', model: '' }
  const db = {
    getAiThread: () => thread,
    createAiMessage: vi.fn().mockReturnValue({ content: 'reply' }),
  } as unknown as StrataDatabase
  mocks.run.mockResolvedValue({ content: 'reply', notesChanged: false })
  registerAiHandlers(db)
  const send = mocks.handlers.get(IPC_CHANNELS.aiSendMessage)!
  await send({}, { threadId: thread.id, message: 'hello' })
  expect(mocks.run.mock.calls[0][2].forcedModel).toBeUndefined()
  thread.model = 'custom::company-model'
  await send({}, { threadId: thread.id, message: 'hello again' })
  expect(mocks.run.mock.calls[1][2].forcedModel).toBe('custom::company-model')
})
