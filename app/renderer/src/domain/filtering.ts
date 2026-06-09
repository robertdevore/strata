import type { Note, SortMode } from '@shared/types'
import { deriveNoteTitle } from './noteUtils'

export type ActiveFilter = 'all' | 'starred' | 'archived' | 'untagged'

export interface ViewFilter {
	activeFilter: ActiveFilter
	searchQuery: string
	selectedTag: string | null
	sortMode: SortMode
}

const searchMatch = (note: Note, query: string): boolean => {
	if (!query) return true
	const term = query.toLowerCase()
	return (
		deriveNoteTitle(note.content).toLowerCase().includes(term) ||
		note.content.toLowerCase().includes(term) ||
		note.tags.join(' ').toLowerCase().includes(term)
	)
}

const baseFilter = (note: Note, filter: ActiveFilter): boolean => {
	if ('all' === filter) return !note.archived
	if ('starred' === filter) return note.starred
	if ('archived' === filter) return note.archived
	if ('untagged' === filter) return !note.archived && 0 === note.tags.length
	return true
}

const sortNotes = (notes: Note[], sortMode: SortMode): Note[] => {
	const copy = [...notes]
	if ('created_desc' === sortMode) return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
	if ('title_asc' === sortMode) return copy.sort((a, b) => deriveNoteTitle(a.content).localeCompare(deriveNoteTitle(b.content)))
	return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const applyFiltersAndSort = (notes: Note[], view: ViewFilter, project_names_by_id: Record<string, string> = {}): Note[] => {
	const filtered = notes.filter((note) => {
		if (note.deletedAt) return false
		if (!baseFilter(note, view.activeFilter)) return false
		if (view.selectedTag && !note.tags.includes(view.selectedTag)) return false
		const matches_query = searchMatch(note, view.searchQuery)
			|| Boolean(note.projectId && project_names_by_id[note.projectId]?.toLowerCase().includes(view.searchQuery.toLowerCase()))
		if (!matches_query) return false
		return true
	})
	return sortNotes(filtered, view.sortMode)
}
