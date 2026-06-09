import { Command } from 'commander'
import { read_content_input } from '../lib/io'
import { derive_title_from_markdown, make_markdown_note, normalize_tags, suggest_tags_from_content } from '../lib/markdown'
import { print_success } from '../lib/output'
import type { CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'

interface RuntimeContext {
	options: CliRuntimeOptions
	client: StrataApiClient
}

const build_agent_note = (text: string, extra_tags: string[]): { content: string; tags: string[] } => {
	const trimmed = text.replace(/\r\n/g, '\n').trim()
	const title = derive_title_from_markdown(trimmed)
	const content = trimmed.startsWith('# ') ? trimmed : make_markdown_note(title, trimmed)
	const auto_tags = suggest_tags_from_content(trimmed)
	const tags = normalize_tags(['agent', 'codex', ...extra_tags, ...auto_tags]).slice(0, 8)
	return { content, tags }
}

const resolve_project_id = async (client: StrataApiClient, project_id?: string, project_name?: string): Promise<string | null> => {
	if (project_id) return project_id
	if (!project_name) return null
	const projects = await client.listProjects()
	const match = projects.find((project) => project.name.toLowerCase() === project_name.trim().toLowerCase())
	return match?.id ?? null
}

const create_agent_note = async (
	context: RuntimeContext,
	action: string,
	text: string,
	extra_tags: string[],
	project_id: string | null = null,
): Promise<void> => {
	const { options, client } = context
	const payload = build_agent_note(text, extra_tags)
	if (options.dryRun) {
		print_success(options, {
			action: 'create_note',
			namespace: action,
			request: {
				method: 'POST',
				path: '/notes',
				payload: {
					...payload,
					projectId: project_id,
				},
			},
		}, { dryRun: true })
		return
	}

	const note = await client.createNote({
		...payload,
		projectId: project_id,
	})
	print_success(options, {
		ok: true,
		action: 'create_note',
		namespace: action,
		noteId: note.id,
		link: `strata-note://${note.id}`,
		tags: note.tags,
		route: 'cheap',
	})
}

export const register_agent_commands = (
	program: Command,
	get_context: (command: Command) => RuntimeContext,
): void => {
	const agent = program.command('agent').description('Agent-safe capture and context commands.')

	agent
		.command('capture [text]')
		.description('Capture raw implementation context into a tagged note.')
		.option('--file <path>', 'Read text from file path')
		.option('--stdin', 'Read text from STDIN')
		.option('--project <name>', 'Attach note to an existing project by name')
		.option('--project-id <id>', 'Attach note to a project by ID')
		.action(async function (text: string | undefined, command_options: { file?: string; stdin?: boolean; project?: string; projectId?: string }) {
			const context = get_context(this)
			const input = text?.trim()
				? text
				: await read_content_input({ file: command_options.file, stdin: command_options.stdin })
			const project_id = await resolve_project_id(context.client, command_options.projectId, command_options.project)
			await create_agent_note(context, 'agent.capture', input, ['capture', 'implementation'], project_id)
		})

	agent
		.command('decision [text]')
		.description('Capture a decision record note from agent output.')
		.option('--file <path>', 'Read text from file path')
		.option('--stdin', 'Read text from STDIN')
		.option('--project <name>', 'Attach note to an existing project by name')
		.option('--project-id <id>', 'Attach note to a project by ID')
		.action(async function (text: string | undefined, command_options: { file?: string; stdin?: boolean; project?: string; projectId?: string }) {
			const context = get_context(this)
			const input = text?.trim()
				? text
				: await read_content_input({ file: command_options.file, stdin: command_options.stdin })
			const project_id = await resolve_project_id(context.client, command_options.projectId, command_options.project)
			await create_agent_note(context, 'agent.decision', input, ['decision'], project_id)
		})

	agent
		.command('todo [text]')
		.description('Capture actionable TODO notes for agents/humans.')
		.option('--file <path>', 'Read text from file path')
		.option('--stdin', 'Read text from STDIN')
		.option('--project <name>', 'Attach note to an existing project by name')
		.option('--project-id <id>', 'Attach note to a project by ID')
		.action(async function (text: string | undefined, command_options: { file?: string; stdin?: boolean; project?: string; projectId?: string }) {
			const context = get_context(this)
			const input = text?.trim()
				? text
				: await read_content_input({ file: command_options.file, stdin: command_options.stdin })
			const project_id = await resolve_project_id(context.client, command_options.projectId, command_options.project)
			await create_agent_note(context, 'agent.todo', input, ['todo'], project_id)
		})

	agent
		.command('summary')
		.description('Capture summary note from file/stdin content.')
		.option('--file <path>', 'Read text from file path')
		.option('--stdin', 'Read text from STDIN')
		.option('--project <name>', 'Attach note to an existing project by name')
		.option('--project-id <id>', 'Attach note to a project by ID')
		.action(async function (command_options: { file?: string; stdin?: boolean; project?: string; projectId?: string }) {
			const context = get_context(this)
			const input = await read_content_input({ file: command_options.file, stdin: command_options.stdin })
			const project_id = await resolve_project_id(context.client, command_options.projectId, command_options.project)
			await create_agent_note(context, 'agent.summary', input, ['summary'], project_id)
		})

	agent
		.command('context search <query>')
		.description('Search notes for relevant agent context (non-destructive).')
		.option('--limit <count>', 'Limit result count', '20')
		.action(async function (query: string, command_options: { limit: string }) {
			const { options, client } = get_context(this)
			const limit = Math.max(1, Math.min(500, Number.parseInt(command_options.limit, 10) || 20))
			const notes = await client.searchNotes(query, limit)
			print_success(options, {
				action: 'search',
				query,
				count: notes.length,
				notes,
			})
		})
}
