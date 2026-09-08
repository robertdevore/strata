import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { DraftCloseGuard } from '../lifecycle/draftCloseGuard'
import { handleTrustedIpc } from '../security/trustedIpc'

const resultSchema = z.object({ requestId: z.string().uuid(), saved: z.boolean() }).strict()
export const registerLifecycleHandlers = (guard: DraftCloseGuard): void => {
  handleTrustedIpc(IPC_CHANNELS.lifecycleReady, () => {
    guard.ready = true
  })
  handleTrustedIpc(IPC_CHANNELS.lifecycleCloseResult, (_event, payload) => {
    const { requestId, saved } = resultSchema.parse(payload)
    return guard.reply(requestId, saved)
  })
}
