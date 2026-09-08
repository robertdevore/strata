import { ipcMain } from 'electron'
import { z } from 'zod'
import type { StrataDatabase } from '../db'
import { IPC_CHANNELS } from '../../shared/ipc'
const idSchema = z.object({ id: z.string().uuid() })
export const registerLinksHandlers = (db: StrataDatabase) => {
  ipcMain.handle(IPC_CHANNELS.linksBacklinks, (_event, payload) =>
    db.getBacklinks(idSchema.parse(payload).id),
  )
  ipcMain.handle(IPC_CHANNELS.linksResolveTarget, (_event, payload) =>
    db.resolveLinkTarget(z.object({ rawTarget: z.string().max(500) }).parse(payload).rawTarget),
  )
  ipcMain.handle(IPC_CHANNELS.linksCreateMissingNote, (_event, payload) => {
    const { title } = z.object({ title: z.string().min(1).max(500) }).parse(payload)
    return db.transaction(
      () => db.resolveLinkTarget(title) ?? db.createNote({ content: `# ${title}\n\n` }),
      'human',
    )
  })
  ipcMain.handle(IPC_CHANNELS.linksRelatedNotes, (_event, payload) =>
    db.getRelatedNotes(idSchema.parse(payload).id),
  )
}
