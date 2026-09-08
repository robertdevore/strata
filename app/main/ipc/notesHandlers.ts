import { KnowledgeService, listSchema, updateSchema, createSchema } from '../services/knowledgeService'
import { ipcMain } from 'electron'
import { z } from 'zod'
import type { StrataDatabase } from '../db/index'
import { IPC_CHANNELS } from '../../shared/ipc'

const id_schema = z.object({ id: z.string().uuid() })

const mutation_schema = id_schema.extend({ expectedRevision: z.number().int().positive() })
const archive_schema = mutation_schema.extend({ archived: z.boolean() })
const star_schema = mutation_schema.extend({ starred: z.boolean() })

export const registerNotesHandlers = (db: StrataDatabase) => {
  const service = new KnowledgeService(db)
  ipcMain.handle('notes:history', (_event, payload) => db.listRevisionSummaries(id_schema.parse(payload).id))
  ipcMain.handle('notes:revision', (_event, payload) => {
    const p = z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).parse(payload)
    return db.getRevision(p.id, p.revision)
  })
  ipcMain.handle('notes:revision:restore', (_event, payload) => {
    const p = z
      .object({
        id: z.string().uuid(),
        revision: z.number().int().positive(),
        expectedRevision: z.number().int().positive(),
      })
      .parse(payload)
    return db.restoreRevision(p.id, p.revision, p.expectedRevision)
  })
  ipcMain.handle('notes:page', (_event, payload) => {
    const page = db.listSummaryPage(listSchema.optional().parse(payload))
    return {
      ...page,
      notes: page.notes.map((note) => ({ ...note, content: note.snippet, contentLoaded: false })),
    }
  })

  ipcMain.handle(IPC_CHANNELS.notesList, (_event, payload) => {
    const filters = listSchema.optional().parse(payload)
    return db.listNotes(filters)
  })

  ipcMain.handle(IPC_CHANNELS.notesListSummaries, (_event, payload) => {
    const filters = listSchema.optional().parse(payload)
    return db.listNoteSummaries(filters)
  })

  ipcMain.handle(IPC_CHANNELS.notesGet, (_event, payload) => {
    const { id } = id_schema.parse(payload)
    return db.getNote(id)
  })

  ipcMain.handle(IPC_CHANNELS.notesCreate, (_event, payload) =>
    service.mutate({ op: 'create_note', payload: createSchema.parse(payload ?? {}) }, { source: 'human' }),
  )
  ipcMain.handle(IPC_CHANNELS.notesUpdate, (_event, payload) => {
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

  ipcMain.handle(IPC_CHANNELS.notesDelete, (_event, payload) => {
    const { id, expectedRevision } = mutation_schema.parse(payload)
    const result = service.mutate({ op: 'delete_note', id, expectedRevision }, { source: 'human' }) as {
      deleted: boolean
    }
    return result.deleted
  })

  ipcMain.handle(IPC_CHANNELS.notesRestore, (_event, payload) => {
    const { id, expectedRevision } = mutation_schema.parse(payload)
    return service.mutate({ op: 'restore_note', id, expectedRevision }, { source: 'restore' })
  })

  ipcMain.handle(IPC_CHANNELS.notesArchive, (_event, payload) => {
    const { id, archived, expectedRevision } = archive_schema.parse(payload)
    return service.mutate(
      { op: 'update_note', id, payload: { archived, expectedRevision } },
      { source: 'human' },
    )
  })

  ipcMain.handle(IPC_CHANNELS.notesStar, (_event, payload) => {
    const { id, starred, expectedRevision } = star_schema.parse(payload)
    return service.mutate(
      { op: 'update_note', id, payload: { starred, expectedRevision } },
      { source: 'human' },
    )
  })

  ipcMain.handle(IPC_CHANNELS.tagsList, () => db.listTags())
}
