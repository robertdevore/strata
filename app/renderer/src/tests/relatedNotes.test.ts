import { describe, expect, test } from 'vitest'
import { computeRelatedNotes } from '@renderer/src/domain/relatedNotes'
import type { Note } from '@shared/types'

const makeNote = (overrides: Partial<Note> = {}): Note => ({
	id: 'n1',
	content: '# Test Note\n\nSome content here.',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	starred: false,
	archived: false,
	tags: [],
	projectId: null,
	deletedAt: null,
	...overrides,
})

describe('computeRelatedNotes', () => {
	test('returns empty for note with no connections', () => {
		const current = makeNote({ id: 'current', content: '# Solo\n\nAlone.' })
		const others = [makeNote({ id: 'other', content: '# Other\n\nDifferent.' })]
		const results = computeRelatedNotes(current, others, [])
		expect(results).toHaveLength(0)
	})

	test('finds notes linked from current note', () => {
		const current = makeNote({ id: 'current', content: '# Current\n\nSee [[Target]].' })
		const target = makeNote({ id: 'target', content: '# Target\n\nBody.' })
		const link_index = [{ sourceNoteId: 'current', targetNoteId: 'target', rawTarget: 'Target' }]
		const results = computeRelatedNotes(current, [current, target], link_index)
		expect(results).toHaveLength(1)
		expect(results[0].note.id).toBe('target')
		expect(results[0].reason).toContain('Linked from this note')
	})

	test('finds backlinks (notes linking to current)', () => {
		const current = makeNote({ id: 'current', content: '# Current\n\nBody.' })
		const linker = makeNote({ id: 'linker', content: '# Linker\n\nSee [[Current]].' })
		const link_index = [{ sourceNoteId: 'linker', targetNoteId: 'current', rawTarget: 'Current' }]
		const results = computeRelatedNotes(current, [current, linker], link_index)
		expect(results).toHaveLength(1)
		expect(results[0].note.id).toBe('linker')
		expect(results[0].reason).toContain('Links here')
	})

	test('finds notes with shared tags', () => {
		const current = makeNote({ id: 'current', content: '# Current', tags: ['dev', 'js'] })
		const other = makeNote({ id: 'other', content: '# Other', tags: ['js', 'web'] })
		const results = computeRelatedNotes(current, [current, other], [])
		expect(results).toHaveLength(1)
		expect(results[0].note.id).toBe('other')
		expect(results[0].reason).toContain('Shared tag')
	})

	test('finds notes via keyword overlap', () => {
		const current = makeNote({ id: 'current', content: '# Current\n\nAuthentication with OAuth2 tokens.' })
		const other = makeNote({ id: 'other', content: '# Other\n\nOAuth2 authentication flow explained.' })
		const results = computeRelatedNotes(current, [current, other], [])
		expect(results).toHaveLength(1)
		expect(results[0].note.id).toBe('other')
		expect(results[0].reason).toContain('Similar text')
	})

	test('excludes current note from results', () => {
		const current = makeNote({ id: 'current', content: '# Current\n\n[[Current]] self-link.' })
		const link_index = [{ sourceNoteId: 'current', targetNoteId: 'current', rawTarget: 'Current' }]
		const results = computeRelatedNotes(current, [current], link_index)
		expect(results).toHaveLength(0)
	})

	test('excludes deleted notes', () => {
		const current = makeNote({ id: 'current', content: '# Current\n\n[[Deleted]].' })
		const deleted = makeNote({ id: 'deleted', content: '# Deleted', deletedAt: '2026-01-01T00:00:00.000Z' })
		const link_index = [{ sourceNoteId: 'current', targetNoteId: 'deleted', rawTarget: 'Deleted' }]
		const results = computeRelatedNotes(current, [current, deleted], link_index)
		expect(results).toHaveLength(0)
	})

	test('scores higher for links than tags', () => {
		const current = makeNote({ id: 'current', content: '# Current\n\n[[Target]].', tags: ['shared'] })
		const linked = makeNote({ id: 'linked', content: '# Target', tags: [] })
		const tagged = makeNote({ id: 'tagged', content: '# Tagged', tags: ['shared'] })
		const link_index = [{ sourceNoteId: 'current', targetNoteId: 'linked', rawTarget: 'Target' }]

		const results = computeRelatedNotes(current, [current, linked, tagged], link_index)
		expect(results).toHaveLength(2)
		// Linked note should rank higher
		expect(results[0].note.id).toBe('linked')
		expect(results[1].note.id).toBe('tagged')
	})

	test('respects max_results limit', () => {
		const current = makeNote({ id: 'current', content: '# Current\n\nBody.', tags: ['shared'] })
		const others = Array.from({ length: 10 }, (_, i) =>
			makeNote({ id: `n${i}`, content: `# Note ${i}`, tags: ['shared'] }),
		)
		const results = computeRelatedNotes(current, [current, ...others], [], 3)
		expect(results.length).toBeLessThanOrEqual(3)
	})
})
