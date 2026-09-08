import { ALL_CHANGED, NO_CHANGED, type ChangedDomains } from '../../shared/changedDomains'
import { handleTrustedIpc } from '../security/trustedIpc'
import { KnowledgeService, listSchema, updateSchema, createSchema } from '../services/knowledgeService'
import { z } from 'zod'
import type { StrataDatabase } from '../db/index'
import { IPC_CHANNELS } from '../../shared/ipc'

const id_schema = z.object({ id: z.string().uuid() })

const mutation_schema = id_schema.extend({ expectedRevision: z.number().int().positive() })
const archive_schema = mutation_schema.extend({ archived: z.boolean() })
const star_schema = mutation_schema.extend({ starred: z.boolean() })

export const registerNotesHandlers = (
  db: StrataDatabase,
  onDataChanged?: (changed: ChangedDomains) => void,
) => {
  const service = new KnowledgeService(db, onDataChanged)
  handleTrustedIpc('history:storage', () => db.historyStats())
  handleTrustedIpc('history:prune:preview', (_event, payload) => {
    const { keep } = z
      .object({ keep: z.number().int().min(20).max(10000) })
      .strict()
      .parse(payload)
    return db.historyPrunePlan(keep)
  })
  handleTrustedIpc('history:prune:apply', (_event, payload) => {
    const { keep, fingerprint } = z
      .object({ keep: z.number().int().min(20).max(10000), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(payload)
    const result = db.pruneHistory(keep, fingerprint)
    if (result) onDataChanged?.({ ...NO_CHANGED, history: true })
    return result
  })
  handleTrustedIpc('notes:history', (_event, payload) =>
    db.listRevisionSummaries(id_schema.parse(payload).id),
  )
  handleTrustedIpc('notes:revision', (_event, payload) => {
    const p = z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).parse(payload)
    return db.getRevision(p.id, p.revision)
  })
  handleTrustedIpc('notes:revision:restore', (_event, payload) => {
    const p = z
      .object({
        id: z.string().uuid(),
        revision: z.number().int().positive(),
        expectedRevision: z.number().int().positive(),
      })
      .parse(payload)
    const result = db.restoreRevision(p.id, p.revision, p.expectedRevision)
    if (result) onDataChanged?.(ALL_CHANGED)
    return result
  })
  handleTrustedIpc('notes:page', (_event, payload) => {
    const page = db.listSummaryPage(listSchema.optional().parse(payload))
    return {
      ...page,
      notes: page.notes.map((note) => ({ ...note, content: note.snippet, contentLoaded: false })),
    }
  })

  handleTrustedIpc(IPC_CHANNELS.notesGet, (_event, payload) => {
    const { id } = id_schema.parse(payload)
    return db.getNote(id)
  })

  handleTrustedIpc(IPC_CHANNELS.notesCreate, (_event, payload) =>
    service.mutate({ op: 'create_note', payload: createSchema.parse(payload ?? {}) }, { source: 'human' }),
  )
  handleTrustedIpc(IPC_CHANNELS.notesUpdate, (_event, payload) => {
    const parsed = z.object({ id: z.string().uuid(), patch: updateSchema }).parse(payload)
    try {
      return service.mutate(
        { op: 'update_note', id: parsed.id, payload: parsed.patch },
        { source: 'autosave' },
      )
    } catch (error) {
      if (error instanceof Error && 'code' in error)
        throw new Error(`${String(error.code)}: ${error.message}`)
      throw error
    }
  })

  handleTrustedIpc(IPC_CHANNELS.notesDelete, (_event, payload) => {
    const { id, expectedRevision } = mutation_schema.parse(payload)
    const result = service.mutate({ op: 'delete_note', id, expectedRevision }, { source: 'human' }) as {
      deleted: boolean
    }
    return result.deleted
  })

  handleTrustedIpc(IPC_CHANNELS.notesRestore, (_event, payload) => {
    const { id, expectedRevision } = mutation_schema.parse(payload)
    return service.mutate({ op: 'restore_note', id, expectedRevision }, { source: 'restore' })
  })

  handleTrustedIpc(IPC_CHANNELS.notesArchive, (_event, payload) => {
    const { id, archived, expectedRevision } = archive_schema.parse(payload)
    return service.mutate(
      { op: 'update_note', id, payload: { archived, expectedRevision } },
      { source: 'human' },
    )
  })

  handleTrustedIpc(IPC_CHANNELS.notesStar, (_event, payload) => {
    const { id, starred, expectedRevision } = star_schema.parse(payload)
    return service.mutate(
      { op: 'update_note', id, payload: { starred, expectedRevision } },
      { source: 'human' },
    )
  })

  handleTrustedIpc(IPC_CHANNELS.tagsList, () => db.listTags())
}
