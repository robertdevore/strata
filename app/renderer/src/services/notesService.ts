import type { Note, NoteUpdatePatch, NotesFilter } from '@shared/types'

export const notesService = {
	list(filters?: NotesFilter): Promise<Note[]> {
		return window.strata.notes.list(filters)
	},
	get(id: string): Promise<Note | null> {
		return window.strata.notes.get(id)
	},
	create(): Promise<Note> {
		return window.strata.notes.create()
	},
	update(id: string, patch: NoteUpdatePatch): Promise<Note | null> {
		return window.strata.notes.update(id, patch)
	},
	delete(id: string): Promise<boolean> {
		return window.strata.notes.delete(id)
	},
	archive(id: string, archived: boolean): Promise<Note | null> {
		return window.strata.notes.archive(id, archived)
	},
	star(id: string, starred: boolean): Promise<Note | null> {
		return window.strata.notes.star(id, starred)
	},
	listTags(): Promise<Array<{ name: string; count: number }>> {
		return window.strata.tags.list()
	},
}
