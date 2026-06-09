import { Command } from 'commander'
import { print_success, format_table } from '../lib/output'
import { derive_title_from_markdown } from '../lib/markdown'
import { CliError } from '../lib/errors'
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
		.option('--project <name>', 'Optional project name filter.')
		.option('--project-id <id>', 'Optional project ID filter.')
		.option('--limit <count>', 'Max notes to return.', '25')
		.action(async function (query: string, command_options: { tag?: string; project?: string; projectId?: string; limit: string }) {
			const { options, client } = get_context(this)
			const limit = Math.max(1, Math.min(500, Number.parseInt(command_options.limit, 10) || 25))
			const project_id = command_options.projectId
				?? (command_options.project
					? (await client.listProjects()).find((project) => project.name.toLowerCase() === command_options.project!.trim().toLowerCase())?.id
					: undefined)
			if (command_options.project && !project_id) {
				throw new CliError({
					message: `Project not found: ${command_options.project}`,
					code: 'PROJECT_NOT_FOUND',
				})
			}
			let notes = await client.searchNotes(query, limit)
			if (command_options.tag) {
				notes = notes.filter((note) => note.tags.includes(command_options.tag || ''))
			}
			if (project_id) {
				notes = notes.filter((note) => note.projectId === project_id)
			}

			const data = {
				query,
				count: notes.length,
				notes,
			}

			if ('pretty' === options.outputMode && !options.quiet) {
				const project_names = new Map((await client.listProjects()).map((project) => [project.id, project.name]))
				const rows = notes.map((note) => [
					note.id.slice(0, 8),
					note.updatedAt,
					note.projectId ? (project_names.get(note.projectId) ?? note.projectId.slice(0, 8)) : '',
					note.tags.join(','),
					derive_title_from_markdown(note.content),
				])
				const table = format_table(['ID', 'Updated', 'Project', 'Tags', 'Title'], rows)
				print_success(options, data, { prettyText: table })
				return
			}

			print_success(options, data)
		})
}
