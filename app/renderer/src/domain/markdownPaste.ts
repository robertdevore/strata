import TurndownService from 'turndown'

const turndown_service = new TurndownService({
	headingStyle: 'atx',
	codeBlockStyle: 'fenced',
	bulletListMarker: '-',
	emDelimiter: '*',
})

turndown_service.keep(['u'])

const normalize_cell_text = (value: string): string => value.replace(/\r?\n/g, ' <br> ').replace(/\s+/g, ' ').trim()

const escape_table_cell = (value: string): string => normalize_cell_text(value).replace(/\|/g, '\\|')

const extract_table_rows = (table_node: HTMLTableElement): string[][] => {
	const rows = Array.from(table_node.querySelectorAll('tr'))
	return rows
		.map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => escape_table_cell(cell.textContent ?? '')))
		.filter((cells) => cells.length > 0)
}

const markdown_table_from_html = (table_node: HTMLTableElement): string => {
	const rows = extract_table_rows(table_node)
	if (0 === rows.length) return ''

	const column_count = Math.max(...rows.map((row) => row.length))
	const normalized_rows = rows.map((row) => {
		const next = [...row]
		while (next.length < column_count) next.push('')
		return next
	})
	const [header, ...body_rows] = normalized_rows
	const separator = Array(column_count).fill('---').join(' | ')

	return [
		`| ${header.join(' | ')} |`,
		`| ${separator} |`,
		...body_rows.map((row) => `| ${row.join(' | ')} |`),
	].join('\n')
}

turndown_service.addRule('tables', {
	filter: 'table',
	replacement: (_content, node) => {
		const markdown_table = markdown_table_from_html(node as HTMLTableElement)
		return markdown_table ? `\n\n${markdown_table}\n\n` : '\n\n'
	},
})

export const normalize_pasted_list_newlines = (text: string): string => {
	return text.replace(/\n\n(?=[-*+])/g, '\n')
		.replace(/\n\n(?=\d+[.)])/g, '\n')
}

export const looks_like_markdown_source = (text: string): boolean => {
	const patterns = [
		/^\s{0,3}#{1,6}\s+\S/m,
		/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/m,
		/^\s{0,3}>\s+\S/m,
		/^```/m,
		/\[\[[^\]]+\]\]/,
		/^\s*\|.+\|\s*$/m,
		/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/m,
	]

	return patterns.some((pattern) => pattern.test(text))
}

export const convert_rich_text_to_markdown = (html_content: string): string => {
	try {
		return turndown_service.turndown(html_content).trimEnd().replace(/\\_/g, '_')
	} catch {
		return ''
	}
}

export const markdown_from_clipboard = (html_content: string, plain_text: string): string => {
	if (plain_text && looks_like_markdown_source(plain_text)) {
		return normalize_pasted_list_newlines(plain_text)
	}

	if (html_content.trim()) {
		const converted = convert_rich_text_to_markdown(html_content)
		if (converted) return converted
	}

	return plain_text ? normalize_pasted_list_newlines(plain_text) : ''
}
