import type { Note } from '@shared/types'
import { deriveNoteTitle } from './noteUtils'

export interface RelatedNote {
	note: Note
	reason: string
	score: number
}

interface LinkIndexEntry {
	sourceNoteId: string
	targetNoteId: string | null
	rawTarget: string
}

/**
 * Compute related notes for a given note using:
 *  1. Explicit wiki links (bidirectional)
 *  2. Shared tags
 *  3. Keyword overlap from title/headings
 *  4. Recency tie-breaker
 *
 * Scoring weights:
 *   linkedFromCurrent  → 50 pts each
 *   linksToCurrent     → 50 pts each
 *   shared tag         → 10 pts each
 *   keyword overlap    →  2 pts per shared word (capped at 50)
 */
export const computeRelatedNotes = (
	current_note: Note,
	all_notes: Note[],
	link_index: LinkIndexEntry[],
	max_results = 8,
): RelatedNote[] => {
	const scored = new Map<string, { note: Note; score: number; reasons: string[] }>()

	// Normalize current note title for keyword extraction
	const current_title = deriveNoteTitle(current_note.content).toLowerCase()
	const current_words = new Set(tokenize(current_title + ' ' + current_note.content))
	const current_tags = new Set(current_note.tags)

	// Build link lookups
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
		// 1. Links from current note
		if (links_from_current.has(candidate.id)) {
			upsert(candidate, 50, 'Linked from this note')
		}

		// 2. Links to current note (backlinks)
		if (links_to_current.has(candidate.id)) {
			upsert(candidate, 50, 'Links here')
		}

		// 3. Shared tags
		const candidate_tags = new Set(candidate.tags)
		let shared_tags = 0
		for (const tag of current_tags) {
			if (candidate_tags.has(tag)) shared_tags++
		}
		if (shared_tags > 0) {
			upsert(candidate, shared_tags * 10, `Shared tag${shared_tags > 1 ? 's' : ''}`)
		}

		// 4. Keyword overlap (capped)
		const candidate_title = deriveNoteTitle(candidate.content).toLowerCase()
		const candidate_words = new Set(tokenize(candidate_title + ' ' + candidate.content))
		let overlap = 0
		for (const word of current_words) {
			if (word.length < 3) continue // skip short words
			if (candidate_words.has(word)) overlap++
		}
		const keyword_score = Math.min(50, overlap * 2)
		if (keyword_score > 0) {
			upsert(candidate, keyword_score, 'Similar text')
		}
	}

	// Sort by score desc, then by updatedAt desc for ties
	const results = [...scored.values()]
		.filter((entry) => entry.score >= 4) // Minimum threshold — skip very weak connections
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

	return results
}

/** Simple tokenizer: lowercase, split on non-alphanumeric, filter short tokens */
const tokenize = (text: string): string[] => {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length >= 2)
}
