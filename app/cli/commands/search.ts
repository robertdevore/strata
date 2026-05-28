import { Command } from 'commander'
import { print_success, format_table } from '../lib/output'
import { derive_title_from_markdown } from '../lib/markdown'
import type { CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'

interface RuntimeContext {
	options: CliRuntimeOptions
	client: StrataApiClient
}

export const register_search_command = (
	program: Command,
	get_context: (command: Command) => RuntimeContext,
): void => {
	program
		.command('search <query>')
		.description('Search notes via Strata local API.')
		.option('--tag <tag>', 'Optional tag filter applied client-side.')
		.option('--limit <count>', 'Max notes to return.', '25')
		.action(async function (query: string, command_options: { tag?: string; limit: string }) {
			const { options, client } = get_context(this)
			const limit = Math.max(1, Math.min(500, Number.parseInt(command_options.limit, 10) || 25))
			let notes = await client.searchNotes(query, limit)
			if (command_options.tag) {
				notes = notes.filter((note) => note.tags.includes(command_options.tag || ''))
			}

			const data = {
				query,
				count: notes.length,
				notes,
			}

			if ('pretty' === options.outputMode && !options.quiet) {
				const rows = notes.map((note) => [
					note.id.slice(0, 8),
					note.updatedAt,
					note.tags.join(','),
					derive_title_from_markdown(note.content),
				])
				const table = format_table(['ID', 'Updated', 'Tags', 'Title'], rows)
				print_success(options, data, { prettyText: table })
				return
			}

			print_success(options, data)
		})
}
