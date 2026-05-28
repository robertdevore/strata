import { Command } from 'commander'
import { read_content_input } from '../lib/io'
import { extract_tasks_deterministic } from '../lib/markdown'
import { print_success } from '../lib/output'
import type { CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'

interface RuntimeContext {
	options: CliRuntimeOptions
	client: StrataApiClient
}

export const register_tasks_commands = (
	program: Command,
	get_context: (command: Command) => RuntimeContext,
): void => {
	const tasks = program.command('tasks').description('Task extraction commands.')

	tasks
		.command('extract')
		.description('Extract task-like action items from markdown content.')
		.option('--content <markdown>', 'Inline markdown text.')
		.option('--file <path>', 'Read markdown from file path.')
		.option('--stdin', 'Read markdown from STDIN.')
		.action(async function (command_options: { content?: string; file?: string; stdin?: boolean }) {
			const { options } = get_context(this)
			const content = await read_content_input(command_options)
			const tasks_found = extract_tasks_deterministic(content)

			print_success(options, {
				ok: true,
				mode: 'deterministic',
				tasks: tasks_found,
				count: tasks_found.length,
				note: 'Provider-backed task extraction can be added later without breaking this contract.',
			})
		})
}
