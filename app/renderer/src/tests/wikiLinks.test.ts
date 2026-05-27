import { describe, expect, test } from 'vitest'
import { parseWikiLinks, normalizeWikiTarget } from '@renderer/src/domain/wikiLinks'

describe('parseWikiLinks', () => {
	test('parses simple [[Target]]', () => {
		const links = parseWikiLinks('See [[My Note]] for details')
		expect(links).toHaveLength(1)
		expect(links[0]).toMatchObject({
			rawTarget: 'My Note',
			label: null,
			heading: null,
		})
	})

	test('parses [[Target|Label]]', () => {
		const links = parseWikiLinks('See [[My Note|my link]] for details')
		expect(links).toHaveLength(1)
		expect(links[0]).toMatchObject({
			rawTarget: 'My Note',
			label: 'my link',
			heading: null,
		})
	})

	test('parses [[Target#Heading]]', () => {
		const links = parseWikiLinks('See [[My Note#Section Two]] for details')
		expect(links).toHaveLength(1)
		expect(links[0]).toMatchObject({
			rawTarget: 'My Note',
			label: null,
			heading: 'Section Two',
		})
	})

	test('parses [[Target#Heading|Label]]', () => {
		const links = parseWikiLinks('See [[My Note#intro|the intro]] for details')
		expect(links).toHaveLength(1)
		expect(links[0]).toMatchObject({
			rawTarget: 'My Note',
			label: 'the intro',
			heading: 'intro',
		})
	})

	test('parses multiple links', () => {
		const links = parseWikiLinks('[[A]] and [[B|label]] and [[C#h]]')
		expect(links).toHaveLength(3)
		expect(links[0].rawTarget).toBe('A')
		expect(links[1].rawTarget).toBe('B')
		expect(links[2].rawTarget).toBe('C')
	})

	test('does not parse embed links with ! prefix', () => {
		const links = parseWikiLinks('Embed ![[My Note]] here')
		expect(links).toHaveLength(0)
	})

	test('returns empty array for no links', () => {
		const links = parseWikiLinks('Just plain text')
		expect(links).toHaveLength(0)
	})

	test('handles empty brackets', () => {
		const links = parseWikiLinks('[[]]')
		expect(links).toHaveLength(0)
		// Empty brackets don't create a link
	})

	test('includes start and end indices', () => {
		const content = 'prefix [[Target]] suffix'
		const links = parseWikiLinks(content)
		expect(links).toHaveLength(1)
		expect(content.slice(links[0].startIndex, links[0].endIndex)).toBe('[[Target]]')
	})

	test('trims whitespace in target', () => {
		const links = parseWikiLinks('[[  My Note  ]]')
		expect(links).toHaveLength(1)
		expect(links[0].rawTarget).toBe('My Note')
	})
})

describe('normalizeWikiTarget', () => {
	test('lowercases and collapses whitespace', () => {
		expect(normalizeWikiTarget('My   Note')).toBe('my note')
	})

	test('trims whitespace', () => {
		expect(normalizeWikiTarget('  hello  ')).toBe('hello')
	})

	test('handles empty string', () => {
		expect(normalizeWikiTarget('')).toBe('')
	})
})
