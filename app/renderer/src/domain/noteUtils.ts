import type { Note } from '@shared/types'

export const deriveNoteTitle = (content: string): string => {
	const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
	if (lines.length === 0) return 'Untitled'
	const heading = lines.find((line) => line.startsWith('#'))
	if (heading) {
		const normalized = heading.replace(/^#+\s*/, '').trim()
		return normalized || 'Untitled'
	}
	return lines[0].slice(0, 80)
}

export const normalizeTag = (tag: string): string => tag.trim().toLowerCase().replace(/\s+/g, '-')

export const formatLastEdited = (iso: string): string => {
	const date = new Date(iso)
	return date.toLocaleString([], {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	})
}

export const countWords = (content: string): number => {
	const words = content.trim().match(/\S+/g)
	return words ? words.length : 0
}

export const hasTag = (note: Note, tag: string): boolean => note.tags.includes(normalizeTag(tag))
