import { describe, expect, it } from 'vitest'
import {
	append_markdown,
	derive_title_from_markdown,
	make_markdown_note,
	normalize_tags,
	suggest_tags_from_content,
} from '../../../../cli/lib/markdown'

describe('cli markdown helpers', () => {
	it('derives title from heading and fallback line', () => {
		expect(derive_title_from_markdown('# Hello\n\nBody')).toBe('Hello')
		expect(derive_title_from_markdown('First line\nSecond line')).toBe('First line')
	})

	it('creates markdown note content with heading', () => {
		const content = make_markdown_note('Routing Plan', 'Use cheap provider first.')
		expect(content.startsWith('# Routing Plan')).toBe(true)
		expect(content.includes('Use cheap provider first.')).toBe(true)
	})

	it('appends markdown with safe spacing', () => {
		expect(append_markdown('# A', 'B')).toBe('# A\n\nB')
	})

	it('normalizes and deduplicates tags', () => {
		expect(normalize_tags(['AI Routing', 'ai-routing', '  notes  '])).toEqual(['ai-routing', 'notes'])
	})

	it('suggests deterministic tags from content', () => {
		const tags = suggest_tags_from_content('Provider routing for DeepSeek and OpenRouter fallback strategy')
		expect(tags.length).toBeGreaterThan(0)
	})
})
