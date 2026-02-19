import { describe, expect, it } from 'vitest'
import type { Note } from '@shared/types'
import { applyFiltersAndSort } from '@renderer/src/domain/filtering'

const notes: Note[] = [
	{
		id: '11111111-1111-4111-8111-111111111111',
		content: '# Alpha\nfoo',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-03T00:00:00.000Z',
		starred: false,
		archived: false,
		tags: ['work'],
		deletedAt: null,
	},
	{
		id: '22222222-2222-4222-8222-222222222222',
		content: '# Beta\nbar',
		createdAt: '2026-01-02T00:00:00.000Z',
		updatedAt: '2026-01-02T00:00:00.000Z',
		starred: true,
		archived: true,
		tags: ['ideas'],
		deletedAt: null,
	},
	{
		id: '33333333-3333-4333-8333-333333333333',
		content: '# Gamma\nbaz',
		createdAt: '2026-01-04T00:00:00.000Z',
		updatedAt: '2026-01-04T00:00:00.000Z',
		starred: true,
		archived: false,
		tags: [],
		deletedAt: null,
	},
]

describe('applyFiltersAndSort', () => {
	it('excludes archived notes for all filter', () => {
		const result = applyFiltersAndSort(notes, {
			activeFilter: 'all',
			searchQuery: '',
			selectedTag: null,
			sortMode: 'updated_desc',
		})

		expect(result.map((item) => item.id)).toEqual([
			'33333333-3333-4333-8333-333333333333',
			'11111111-1111-4111-8111-111111111111',
		])
	})

	it('includes archived notes for starred filter', () => {
		const result = applyFiltersAndSort(notes, {
			activeFilter: 'starred',
			searchQuery: '',
			selectedTag: null,
			sortMode: 'updated_desc',
		})

		expect(result.map((item) => item.id)).toEqual([
			'33333333-3333-4333-8333-333333333333',
			'22222222-2222-4222-8222-222222222222',
		])
	})

	it('filters by selected tag and query', () => {
		const result = applyFiltersAndSort(notes, {
			activeFilter: 'all',
			searchQuery: 'alpha',
			selectedTag: 'work',
			sortMode: 'updated_desc',
		})

		expect(result.map((item) => item.id)).toEqual(['11111111-1111-4111-8111-111111111111'])
	})
})
