import type { Note, NoteUpdatePatch, NotesFilter, Settings } from '../shared/types'

export interface StrataApi {
	notes: {
		list: (filters?: NotesFilter) => Promise<Note[]>
		get: (id: string) => Promise<Note | null>
		create: () => Promise<Note>
		update: (id: string, patch: NoteUpdatePatch) => Promise<Note | null>
		delete: (id: string) => Promise<boolean>
		archive: (id: string, archived: boolean) => Promise<Note | null>
		star: (id: string, starred: boolean) => Promise<Note | null>
	}
	tags: {
		list: () => Promise<Array<{ name: string; count: number }>>
	}
	settings: {
		get: () => Promise<Settings>
		set: (patch: Partial<Settings>) => Promise<Settings>
	}
	exports: {
		pdf: (payload: { html: string }) => Promise<Uint8Array>
	}
	onCommand: (listener: (command: string) => void) => () => void
	onNotesChanged: (listener: () => void) => () => void
}
