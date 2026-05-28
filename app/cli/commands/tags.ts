import { Command } from 'commander'
import { print_success, format_table } from '../lib/output'
import { normalize_tags, suggest_tags_from_content } from '../lib/markdown'
import { read_content_input } from '../lib/io'
import type { CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'

interface RuntimeContext {
	options: CliRuntimeOptions
	client: StrataApiClient
}

export const register_tags_commands = (
	program: Command,
	get_context: (command: Command) => RuntimeContext,
): void => {
	const tags = program.command('tags').description('Tag utilities for Strata notes.')

	tags
		.command('list')
		.description('List tags and usage counts.')
		.action(async function () {
			const { options, client } = get_context(this)
			const tag_stats = await client.listTags()
			const data = {
				tags: tag_stats,
				count: tag_stats.length,
			}
			if ('pretty' === options.outputMode && !options.quiet) {
				const rows = tag_stats.map((entry) => [entry.name, String(entry.count)])
				print_success(options, data, { prettyText: format_table(['Tag', 'Count'], rows) })
				return
			}
			print_success(options, data)
		})

	tags
		.command('suggest')
		.description('Suggest tags deterministically from note content.')
		.option('--content <markdown>', 'Content string input.')
		.option('--file <path>', 'Read content from file path.')
		.option('--stdin', 'Read content from STDIN.')
		.action(async function (command_options: { content?: string; file?: string; stdin?: boolean }) {
			const { options } = get_context(this)
			const content = await read_content_input(command_options)
			const suggested = suggest_tags_from_content(content)
			print_success(options, {
				suggested,
				count: suggested.length,
			})
		})

	tags
		.command('normalize <rawTags>')
		.description('Normalize comma-separated tags into canonical slug tags.')
		.action(async function (raw_tags: string) {
			const { options } = get_context(this)
			const normalized = normalize_tags(raw_tags.split(','))
			print_success(options, {
				normalized,
				count: normalized.length,
			})
		})
}
