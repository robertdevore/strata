import { ipcMain } from 'electron'
import { z } from 'zod'
import type { Note } from '../../shared/types'
import type { StrataDatabase } from '../db/index'
import { IPC_CHANNELS } from '../../shared/ipc'

const id_schema = z.object({ id: z.string().uuid() })

const create_missing_schema = z.object({ title: z.string().min(1).max(500) })

/** Derive a note title from content — mirrors deriveNoteTitle in renderer. */
const deriveTitle = (content: string): string => {
	const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
	if (lines.length === 0) return 'Untitled'
	const heading = lines.find((line) => line.startsWith('# '))
	if (heading) {
		const normalized = heading.replace(/^#\s*/, '').trim()
		return normalized || 'Untitled'
	}
	return lines[0].slice(0, 80)
}

const tokenize = (text: string): string[] => {
	return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2)
}

interface LinkEntry {
	sourceNoteId: string
	targetNoteId: string | null
	rawTarget: string
}

const computeRelatedNotesMain = (
	current_note: Note,
	all_notes: Note[],
	link_index: LinkEntry[],
	max_results = 8,
) => {
	const scored = new Map<string, { note: Note; score: number; reasons: string[] }>()
	const current_title = deriveTitle(current_note.content).toLowerCase()
	const current_words = new Set(tokenize(current_title + ' ' + current_note.content))
	const current_tags = new Set(current_note.tags)

	const links_from_current = new Set(
		link_index.filter((l) => l.sourceNoteId === current_note.id && l.targetNoteId).map((l) => l.targetNoteId!),
	)
	const links_to_current = new Set(
		link_index.filter((l) => l.targetNoteId === current_note.id).map((l) => l.sourceNoteId),
	)

	const upsert = (note: Note, score_delta: number, reason: string) => {
		if (note.id === current_note.id) return
		if (note.deletedAt) return
		const entry = scored.get(note.id)
		if (entry) {
			entry.score += score_delta
			if (!entry.reasons.includes(reason)) entry.reasons.push(reason)
		} else {
			scored.set(note.id, { note, score: score_delta, reasons: [reason] })
		}
	}

	for (const candidate of all_notes) {
		if (links_from_current.has(candidate.id)) upsert(candidate, 50, 'Linked from this note')
		if (links_to_current.has(candidate.id)) upsert(candidate, 50, 'Links here')

		const candidate_tags = new Set(candidate.tags)
		let shared_tags = 0
		for (const tag of current_tags) {
			if (candidate_tags.has(tag)) shared_tags++
		}
		if (shared_tags > 0) upsert(candidate, shared_tags * 10, `Shared tag${shared_tags > 1 ? 's' : ''}`)

		const candidate_title = deriveTitle(candidate.content).toLowerCase()
		const candidate_words = new Set(tokenize(candidate_title + ' ' + candidate.content))
		let overlap = 0
		for (const word of current_words) {
			if (word.length < 3) continue
			if (candidate_words.has(word)) overlap++
		}
		const keyword_score = Math.min(50, overlap * 2)
		if (keyword_score > 0) upsert(candidate, keyword_score, 'Similar text')
	}

	return [...scored.values()]
		.filter((entry) => entry.score >= 6)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score
			return b.note.updatedAt.localeCompare(a.note.updatedAt)
		})
		.slice(0, max_results)
		.map((entry) => ({
			note: entry.note,
			reason: entry.reasons.join(', '),
			score: entry.score,
		}))
}

export const registerLinksHandlers = (db: StrataDatabase) => {
	ipcMain.handle(IPC_CHANNELS.linksBacklinks, (_event, payload) => {
		const { id } = id_schema.parse(payload)
		return db.getBacklinks(id)
	})

	ipcMain.handle(IPC_CHANNELS.linksResolveTarget, (_event, payload) => {
		// Resolve a raw wiki target to a note ID (for clicking links in preview)
		const schema = z.object({ rawTarget: z.string() })
		const { rawTarget } = schema.parse(payload)
		const normalized = rawTarget.trim().toLowerCase().replace(/\s+/g, ' ')
		const all_notes = db.listNotes({ includeDeleted: false })
		const match = all_notes.find((note) => {
			const lines = note.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
			if (lines.length === 0) return false
			const heading = lines.find((line) => line.startsWith('# '))
			const title = heading ? heading.replace(/^#\s*/, '').trim() : lines[0].slice(0, 80)
			return title.trim().toLowerCase().replace(/\s+/g, ' ') === normalized
		})
		return match ?? null
	})

	ipcMain.handle(IPC_CHANNELS.linksCreateMissingNote, (_event, payload) => {
		const { title } = create_missing_schema.parse(payload)
		// Create a note with the given title as H1
		const note = db.createNote()
		const content = `# ${title}\n\n`
		db.updateNote(note.id, { content })
		return db.getNote(note.id)
	})

	ipcMain.handle(IPC_CHANNELS.linksRelatedNotes, (_event, payload) => {
		const { id } = id_schema.parse(payload)
		const current_note = db.getNote(id)
		if (!current_note) return []
		const all_notes = db.listNotes({ includeDeleted: false })
		const link_index = db.getAllLinks()

		// Compute related notes on the main process side using the same algorithm
		return computeRelatedNotesMain(current_note, all_notes, link_index)
	})
}
