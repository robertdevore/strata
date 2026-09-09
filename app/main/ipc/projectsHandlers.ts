import type { ChangedDomains } from '../../shared/changedDomains'
import { handleTrustedIpc } from '../security/trustedIpc'
import { z } from 'zod'
import type { StrataDatabase } from '../db/index'
import { IPC_CHANNELS } from '../../shared/ipc'
import { KnowledgeService } from '../services/knowledgeService'

export const registerProjectsHandlers = (
  db: StrataDatabase,
  onDataChanged?: (changed: ChangedDomains) => void,
) => {
  const service = new KnowledgeService(db, onDataChanged)
  handleTrustedIpc(IPC_CHANNELS.projectsList, () => db.listProjectSummaries())
  handleTrustedIpc(IPC_CHANNELS.projectsCreate, (_event, payload) => {
    const { name } = z.object({ name: z.string() }).strict().parse(payload)
    return service.mutate({ op: 'create_project', name }, { source: 'human' })
  })
  handleTrustedIpc(IPC_CHANNELS.projectsUpdate, (_event, payload) => {
    const { id, name } = z.object({ id: z.string(), name: z.string() }).strict().parse(payload)
    return service.mutate({ op: 'rename_project', id, name }, { source: 'human' })
  })
  handleTrustedIpc(IPC_CHANNELS.projectsDelete, (_event, payload) => {
    const { id } = z.object({ id: z.string() }).strict().parse(payload)
    const result = service.mutate({ op: 'delete_project', id }, { source: 'human' }) as { deleted: boolean }
    return result.deleted
  })
  handleTrustedIpc(IPC_CHANNELS.projectsImportFolder, (_event, payload) => service.importFolder(payload))
  handleTrustedIpc(IPC_CHANNELS.projectsReorder, (_event, payload) => {
    const { projectIds } = z
      .object({ projectIds: z.array(z.string()) })
      .strict()
      .parse(payload)
    return service.mutate({ op: 'reorder_projects', projectIds }, { source: 'human' })
  })
}
