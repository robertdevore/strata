import { ipcMain } from 'electron'
import { z } from 'zod'
import type { StrataDatabase } from '../db/index'
import { IPC_CHANNELS } from '../../shared/ipc'

const list_schema = z
	.object({
		query: z.string().optional(),
		starred: z.boolean().optional(),
		archived: z.boolean().optional(),
		tag: z.string().optional(),
		includeDeleted: z.boolean().optional(),
	})
	.optional()

const id_schema = z.object({ id: z.string().uuid() })

const update_schema = z.object({
	id: z.string().uuid(),
	patch: z.object({
		content: z.string().optional(),
		starred: z.boolean().optional(),
		archived: z.boolean().optional(),
		tags: z.array(z.string()).optional(),
	}),
})

const archive_schema = z.object({ id: z.string().uuid(), archived: z.boolean() })
const star_schema = z.object({ id: z.string().uuid(), starred: z.boolean() })

export const registerNotesHandlers = (db: StrataDatabase) => {
	ipcMain.handle(IPC_CHANNELS.notesList, (_event, payload) => {
		const filters = list_schema.parse(payload)
		return db.listNotes(filters)
	})

	ipcMain.handle(IPC_CHANNELS.notesGet, (_event, payload) => {
		const { id } = id_schema.parse(payload)
		return db.getNote(id)
	})

	ipcMain.handle(IPC_CHANNELS.notesCreate, () => db.createNote())

	ipcMain.handle(IPC_CHANNELS.notesUpdate, (_event, payload) => {
		const { id, patch } = update_schema.parse(payload)
		return db.updateNote(id, patch)
	})

	ipcMain.handle(IPC_CHANNELS.notesDelete, (_event, payload) => {
		const { id } = id_schema.parse(payload)
		return db.deleteNote(id)
	})

	ipcMain.handle(IPC_CHANNELS.notesArchive, (_event, payload) => {
		const { id, archived } = archive_schema.parse(payload)
		return db.archiveNote(id, archived)
	})

	ipcMain.handle(IPC_CHANNELS.notesStar, (_event, payload) => {
		const { id, starred } = star_schema.parse(payload)
		return db.starNote(id, starred)
	})

	ipcMain.handle(IPC_CHANNELS.tagsList, () => db.listTags())
}
