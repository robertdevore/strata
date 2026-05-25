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

export const formatRelativeTime = (iso: string): string => {
	const now = Date.now()
	const then = new Date(iso).getTime()
	const diff_ms = now - then
	const seconds = Math.floor(diff_ms / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)
	const weeks = Math.floor(days / 7)
	const months = Math.floor(days / 30)
	const years = Math.floor(days / 365)

	if (seconds < 60) return 'now'
	if (minutes < 60) return `${minutes}m`
	if (hours < 24) return `${hours}h`
	if (days < 7) return `${days}d`
	if (weeks < 5) return `${weeks}w`
	if (months < 12) return `${months}mo`
	return `${years}y`
}

export const countWords = (content: string): number => {
	const words = content.trim().match(/\S+/g)
	return words ? words.length : 0
}

export const hasTag = (note: Note, tag: string): boolean => note.tags.includes(normalizeTag(tag))
