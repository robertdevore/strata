import { Command } from 'commander'
import { CliError } from '../lib/errors'
import { print_success, format_table } from '../lib/output'
import { append_markdown, derive_title_from_markdown, normalize_tags, truncate_preview } from '../lib/markdown'
import { read_content_input } from '../lib/io'
import { ensure_agent_destructive_allowed, ensure_confirm_or_dry_run } from '../lib/agentMode'
import {
	note_create_patch_schema,
	note_id_schema,
	note_update_patch_schema,
	notes_filter_schema,
} from '../lib/validators'
import { ExitCode, type CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'

interface RuntimeContext {
	options: CliRuntimeOptions
	client: StrataApiClient
}

const parse_optional_boolean = (value: string | undefined): boolean | undefined => {
	if (undefined === value) return undefined
	if ('true' === value.toLowerCase()) return true
	if ('false' === value.toLowerCase()) return false
	throw new CliError({
		message: `Expected boolean value but received: ${value}`,
		exitCode: ExitCode.ValidationError,
		code: 'INVALID_BOOLEAN',
	})
}

const collect_values = (value: string, previous: string[] = []): string[] => {
	previous.push(value)
	return previous
}

const normalize_project_name = (value: string): string => value.trim().replace(/\s+/g, ' ')

const resolve_project_id = async (
	client: StrataApiClient,
	project_id?: string,
	project_name?: string,
): Promise<string | null> => {
	if (project_id) return project_id
	if (!project_name) return null
	const projects = await client.listProjects()
	const normalized = normalize_project_name(project_name).toLowerCase()
	const match = projects.find((project) => project.name.toLowerCase() === normalized)
	if (!match) {
		throw new CliError({
			message: `Project not found: ${project_name}`,
			exitCode: ExitCode.ValidationError,
			code: 'PROJECT_NOT_FOUND',
		})
	}
	return match.id
}

export const register_notes_commands = (
	program: Command,
	get_context: (command: Command) => RuntimeContext,
): void => {
	const notes = program.command('notes').description('Manage Strata notes safely through local HTTP API.')

	notes
		.command('list')
		.description('List notes with optional filters.')
		.option('--query <query>', 'Search query')
		.option('--tag <tag>', 'Filter by tag')
		.option('--project <name>', 'Filter by project name')
		.option('--project-id <id>', 'Filter by project ID')
		.option('--starred', 'Show only starred notes')
		.option('--archived <bool>', 'Filter archived true|false')
		.option('--include-deleted', 'Include soft-deleted notes')
		.option('--limit <count>', 'Limit result count', '50')
		.action(async function (command_options: {
			query?: string
			tag?: string
			project?: string
			projectId?: string
			starred?: boolean
			archived?: string
			includeDeleted?: boolean
			limit: string
		}) {
			const { options, client } = get_context(this)
			const limit = Math.max(1, Math.min(500, Number.parseInt(command_options.limit, 10) || 50))
			const projects = command_options.project ? await client.listProjects() : []
			const project_id = command_options.projectId
				? command_options.projectId
				: (command_options.project
					? projects.find((project) => project.name.toLowerCase() === normalize_project_name(command_options.project ?? '').toLowerCase())?.id
					: undefined)
			if (command_options.project && !project_id) {
				throw new CliError({
					message: `Project not found: ${command_options.project}`,
					exitCode: ExitCode.ValidationError,
					code: 'PROJECT_NOT_FOUND',
				})
			}
			const filters = notes_filter_schema.parse({
				query: command_options.query,
				tag: command_options.tag,
				projectId: project_id,
				starred: command_options.starred ? true : undefined,
				archived: parse_optional_boolean(command_options.archived),
				includeDeleted: command_options.includeDeleted,
				limit,
			})

			let result = await client.listNotes(filters)
			if (result.length > limit) {
				result = result.slice(0, limit)
			}

			const data = {
				ok: true,
				count: result.length,
				notes: result,
			}
			if ('pretty' === options.outputMode && !options.quiet) {
				const project_names = new Map((await client.listProjects()).map((project) => [project.id, project.name]))
				const rows = result.map((note) => [
					note.id.slice(0, 8),
					note.updatedAt,
					note.projectId ? (project_names.get(note.projectId) ?? note.projectId.slice(0, 8)) : '',
					note.tags.join(','),
					derive_title_from_markdown(note.content),
				])
				print_success(options, data, { prettyText: format_table(['ID', 'Updated', 'Project', 'Tags', 'Title'], rows) })
				return
			}
			print_success(options, data)
		})

	notes
		.command('get <noteId>')
		.description('Get one note by ID.')
		.option('--content-only', 'Print only note content.')
		.action(async function (note_id: string, command_options: { contentOnly?: boolean }) {
			const { options, client } = get_context(this)
			note_id_schema.parse(note_id)
			const note = await client.getNote(note_id)

			if (command_options.contentOnly && 'pretty' === options.outputMode) {
				if (!options.quiet) process.stdout.write(note.content + '\n')
				return
			}

			print_success(options, { note })
		})

	notes
		.command('create')
		.description('Create a note from content, file, or stdin.')
		.option('--content <markdown>', 'Markdown content')
		.option('--file <path>', 'Read markdown from file path')
		.option('--stdin', 'Read markdown from STDIN')
		.option('--tag <tag>', 'Tag to apply (repeat)', collect_values, [])
		.option('--starred', 'Set note starred')
		.option('--archived', 'Set note archived')
		.option('--project <name>', 'Attach note to an existing project by name')
		.option('--project-id <id>', 'Attach note to a project by ID')
		.action(async function (command_options: {
			content?: string
			file?: string
			stdin?: boolean
			tag: string[]
			starred?: boolean
			archived?: boolean
			project?: string
			projectId?: string
		}) {
			const { options, client } = get_context(this)
			const content = await read_content_input({
				content: command_options.content,
				file: command_options.file,
				stdin: command_options.stdin,
			})
			const project_id = await resolve_project_id(client, command_options.projectId, command_options.project)
			const payload = note_create_patch_schema.parse({
				content,
				tags: normalize_tags(command_options.tag || []),
				starred: Boolean(command_options.starred),
				archived: Boolean(command_options.archived),
				projectId: project_id,
			})

			if (options.dryRun) {
				print_success(options, {
					action: 'notes.create',
					request: {
						method: 'POST',
						path: '/notes',
						payload,
					},
				}, { dryRun: true })
				return
			}

			const note = await client.createNote(payload)
			print_success(options, {
				note,
				link: `strata-note://${note.id}`,
			})
		})

	notes
		.command('update <noteId>')
		.description('Update a note. Requires --confirm unless --dry-run.')
		.option('--content <markdown>', 'Replace note content')
		.option('--file <path>', 'Replace content from file path')
		.option('--stdin', 'Replace content from STDIN')
		.option('--append <markdown>', 'Append markdown content to existing note')
		.option('--tag <tag>', 'Set tags (repeat for full set)', collect_values, [])
		.option('--starred <bool>', 'Set starred true|false')
		.option('--archived <bool>', 'Set archived true|false')
		.option('--project <name>', 'Move note to an existing project by name')
		.option('--project-id <id>', 'Move note to a project by ID')
		.option('--clear-project', 'Remove note from its project')
		.action(async function (note_id: string, command_options: {
			content?: string
			file?: string
			stdin?: boolean
			append?: string
			tag: string[]
			starred?: string
			archived?: string
			project?: string
			projectId?: string
			clearProject?: boolean
		}) {
			const { options, client } = get_context(this)
			note_id_schema.parse(note_id)
			ensure_confirm_or_dry_run(options, 'notes update')

			const current_note = await client.getNote(note_id)
			const content_from_source = (command_options.content || command_options.file || command_options.stdin)
				? await read_content_input({
					content: command_options.content,
					file: command_options.file,
					stdin: command_options.stdin,
				})
				: undefined

			const next_content = command_options.append
				? append_markdown(current_note.content, command_options.append)
				: content_from_source

			const next_project_id = command_options.clearProject
				? null
				: await resolve_project_id(client, command_options.projectId, command_options.project)
			const has_tags = (command_options.tag || []).length > 0
			const payload = note_update_patch_schema.parse({
				content: next_content,
				tags: has_tags ? normalize_tags(command_options.tag || []) : undefined,
				starred: parse_optional_boolean(command_options.starred),
				archived: parse_optional_boolean(command_options.archived),
				projectId: command_options.clearProject || command_options.project || command_options.projectId ? next_project_id : undefined,
			})

			if (0 === Object.keys(payload).length) {
				throw new CliError({
					message: 'No update fields provided. Use --content, --append, --tag, --starred, or --archived.',
					exitCode: ExitCode.ValidationError,
					code: 'EMPTY_UPDATE_PATCH',
				})
			}

			const preview = {
				noteId: current_note.id,
				oldTitle: derive_title_from_markdown(current_note.content),
				newTitle: derive_title_from_markdown(payload.content ?? current_note.content),
				oldLength: current_note.content.length,
				newLength: (payload.content ?? current_note.content).length,
				oldTags: current_note.tags,
				newTags: payload.tags ?? current_note.tags,
				oldProject: current_note.projectId,
				newProject: payload.projectId ?? current_note.projectId,
				oldPreview: truncate_preview(current_note.content),
				newPreview: truncate_preview(payload.content ?? current_note.content),
			}

			if (options.dryRun) {
				print_success(options, {
					action: 'notes.update',
					request: {
						method: 'PATCH',
						path: `/notes/${note_id}`,
						payload,
					},
					preview,
				}, { dryRun: true })
				return
			}

			const note = await client.updateNote(note_id, payload)
			print_success(options, { note, preview })
		})

	notes
		.command('delete <noteId>')
		.description('Delete a note. Requires --confirm. In --agent mode also requires --allow-destructive.')
		.option('--allow-destructive', 'Required with --agent for destructive operations')
		.action(async function (note_id: string, command_options: { allowDestructive?: boolean }) {
			const { options, client } = get_context(this)
			note_id_schema.parse(note_id)
			ensure_confirm_or_dry_run(options, 'notes delete')
			if (!options.dryRun) {
				ensure_agent_destructive_allowed(options, Boolean(command_options.allowDestructive), 'notes delete')
			}

			if (options.dryRun) {
				print_success(options, {
					action: 'notes.delete',
					request: {
						method: 'DELETE',
						path: `/notes/${note_id}`,
					},
				}, { dryRun: true })
				return
			}

			const result = await client.deleteNote(note_id)
			print_success(options, {
				noteId: note_id,
				deleted: result.deleted,
			})
		})

	notes
		.command('delete-many')
		.description('Bulk delete notes. Requires --confirm and --confirm-bulk-delete.')
		.requiredOption('--id <noteId...>', 'One or more note IDs to delete')
		.option('--allow-destructive', 'Required with --agent for destructive operations')
		.option('--confirm-bulk-delete', 'Extra safety flag required for bulk deletion')
		.action(async function (command_options: { id: string[]; allowDestructive?: boolean; confirmBulkDelete?: boolean }) {
			const { options, client } = get_context(this)
			ensure_confirm_or_dry_run(options, 'notes delete-many')
			if (!command_options.confirmBulkDelete) {
				throw new CliError({
					message: 'Bulk delete requires --confirm-bulk-delete.',
					exitCode: ExitCode.UnsafeRefused,
					code: 'BULK_DELETE_CONFIRMATION_REQUIRED',
				})
			}
			if (!options.dryRun) {
				ensure_agent_destructive_allowed(options, Boolean(command_options.allowDestructive), 'notes delete-many')
			}
			const ids = (command_options.id || []).map((id) => note_id_schema.parse(id))

			if (options.dryRun) {
				print_success(options, {
					action: 'notes.delete-many',
					count: ids.length,
					ids,
				}, { dryRun: true })
				return
			}

			let deleted_count = 0
			const failed_ids: string[] = []
			for (const id of ids) {
				try {
					const result = await client.deleteNote(id)
					if (result.deleted) deleted_count += 1
					else failed_ids.push(id)
				} catch {
					failed_ids.push(id)
				}
			}

			const data = {
				deletedCount: deleted_count,
				failedCount: failed_ids.length,
				failedIds: failed_ids,
			}
			print_success(options, data)

			if (failed_ids.length > 0 && options.failOnWarning) {
				throw new CliError({
					message: 'Bulk delete completed with failures.',
					exitCode: ExitCode.PartialFailure,
					code: 'BULK_DELETE_PARTIAL_FAILURE',
					details: data,
				})
			}
		})

	const archive_action = async (
		command: Command,
		note_id: string,
		archived: boolean,
	): Promise<void> => {
		const { options, client } = get_context(command)
		note_id_schema.parse(note_id)
		ensure_confirm_or_dry_run(options, archived ? 'notes archive' : 'notes unarchive')

		if (options.dryRun) {
			print_success(options, {
				action: archived ? 'notes.archive' : 'notes.unarchive',
				noteId: note_id,
				payload: { archived },
			}, { dryRun: true })
			return
		}

		const note = await client.updateNote(note_id, { archived })
		print_success(options, { note })
	}

	notes
		.command('archive <noteId>')
		.description('Archive a note. Requires --confirm unless --dry-run.')
		.action(async function (note_id: string) {
			await archive_action(this, note_id, true)
		})

	notes
		.command('unarchive <noteId>')
		.description('Unarchive a note. Requires --confirm unless --dry-run.')
		.action(async function (note_id: string) {
			await archive_action(this, note_id, false)
		})

	const star_action = async (command: Command, note_id: string, starred: boolean): Promise<void> => {
		const { options, client } = get_context(command)
		note_id_schema.parse(note_id)

		if (options.dryRun) {
			print_success(options, {
				action: starred ? 'notes.star' : 'notes.unstar',
				noteId: note_id,
				payload: { starred },
			}, { dryRun: true })
			return
		}

		const note = await client.updateNote(note_id, { starred })
		print_success(options, { note })
	}

	notes
		.command('star <noteId>')
		.description('Star a note.')
		.action(async function (note_id: string) {
			await star_action(this, note_id, true)
		})

	notes
		.command('unstar <noteId>')
		.description('Remove star from a note.')
		.action(async function (note_id: string) {
			await star_action(this, note_id, false)
		})
}
