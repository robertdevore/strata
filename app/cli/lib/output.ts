import type { CliRuntimeOptions, CliSuccessPayload } from '../types'

const stringify = (value: unknown): string => JSON.stringify(value, null, 2)

export const print_success = <TData extends Record<string, unknown>>(
	options: CliRuntimeOptions,
	data: TData,
	extra: { dryRun?: boolean; prettyText?: string } = {},
): void => {
	if ('json' === options.outputMode) {
		const payload: CliSuccessPayload<TData> = {
			ok: true,
			data,
		}
		if (extra.dryRun) payload.dryRun = true
		process.stdout.write(stringify(payload) + '\n')
		return
	}

	if (options.quiet) return

	if (extra.prettyText) {
		process.stdout.write(extra.prettyText + '\n')
		return
	}

	process.stdout.write(stringify(data) + '\n')
}

export const format_table = (headers: string[], rows: string[][]): string => {
	const widths = headers.map((header, index) => {
		const row_width = rows.reduce((max, row) => Math.max(max, (row[index] || '').length), 0)
		return Math.max(header.length, row_width)
	})

	const format_row = (columns: string[]): string => {
		return columns
			.map((column, index) => (column || '').padEnd(widths[index]))
			.join('  ')
	}

	const separator = widths.map((width) => '-'.repeat(width)).join('  ')
	const lines = [format_row(headers), separator]
	for (const row of rows) {
		lines.push(format_row(row))
	}
	return lines.join('\n')
}
