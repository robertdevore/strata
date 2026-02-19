import { describe, expect, it } from 'vitest'
import { deriveNoteTitle, normalizeTag } from '@renderer/src/domain/noteUtils'

describe('deriveNoteTitle', () => {
	it('uses first markdown heading when present', () => {
		expect(deriveNoteTitle('# My Title\n\nBody')).toBe('My Title')
	})

	it('falls back to first non-empty line', () => {
		expect(deriveNoteTitle('\n\nfirst line\nsecond')).toBe('first line')
	})

	it('returns Untitled note when content is empty', () => {
		expect(deriveNoteTitle('   ')).toBe('Untitled note')
	})
})

describe('normalizeTag', () => {
	it('normalizes case and spaces', () => {
		expect(normalizeTag('  Product Ideas  ')).toBe('product-ideas')
	})

	it('removes unsupported characters', () => {
		expect(normalizeTag('A/B+C')).toBe('abc')
	})
})
