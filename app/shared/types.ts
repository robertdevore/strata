export type ThemeMode = 'dark' | 'light' | 'system'

export type ViewMode = 'all' | 'starred'

export type SortMode = 'updated_desc' | 'created_desc' | 'title_asc'

export interface Note {
	id: string
	content: string
	createdAt: string
	updatedAt: string
	starred: boolean
	archived: boolean
	tags: string[]
	deletedAt: string | null
}

export interface NotesFilter {
	query?: string
	starred?: boolean
	archived?: boolean
	tag?: string
	includeDeleted?: boolean
}

export interface Settings {
	theme: ThemeMode
	defaultView: ViewMode
	confirmDelete: boolean
	sortMode: SortMode
}

export interface NoteUpdatePatch {
	content?: string
	starred?: boolean
	archived?: boolean
	tags?: string[]
}

export interface ListResult {
	notes: Note[]
}
