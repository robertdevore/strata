import { beforeAll, describe, expect, test } from 'vitest'
import { JSDOM } from 'jsdom'
import { markdown_from_clipboard } from '@renderer/src/domain/markdownPaste'

beforeAll(() => {
	const dom = new JSDOM('<!doctype html><html><body></body></html>')
	Object.assign(globalThis as Record<string, unknown>, {
		window: dom.window,
		document: dom.window.document,
		DOMParser: dom.window.DOMParser,
	})
})

describe('markdown clipboard paste', () => {
	test('preserves raw markdown table text', () => {
		const input = '| Name | Value |\n| --- | --- |\n| One | Two |'
		expect(markdown_from_clipboard('', input)).toBe(input)
	})

	test('converts html tables to markdown tables', () => {
		const html = '<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>One</td><td>Two</td></tr></tbody></table>'
		const output = markdown_from_clipboard(html, '')
		expect(output).toContain('| Name | Value |')
		expect(output).toContain('| --- | --- |')
		expect(output).toContain('| One | Two |')
	})

	test('does not add backslashes before underscores when converting html', () => {
		const html = '<p>alpha_beta</p>'
		expect(markdown_from_clipboard(html, '')).toContain('alpha_beta')
		expect(markdown_from_clipboard(html, '')).not.toContain('\\_')
	})
})
