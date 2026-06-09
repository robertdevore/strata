import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'
import { CliError } from '../lib/errors'
import { print_success, format_table } from '../lib/output'
import type { CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'
import { derive_title_from_markdown } from '../lib/markdown'
import { note_create_patch_schema } from '../lib/validators'

interface RuntimeContext {
	options: CliRuntimeOptions
	client: StrataApiClient
}

const is_markdown_file = (file_path: string): boolean => file_path.toLowerCase().endsWith('.md')

const normalize_project_name = (value: string): string => value.trim().replace(/\s+/g, ' ')

const collect_markdown_files = async (root_path: string): Promise<string[]> => {
	const stat = await fs.stat(root_path)
	if (stat.isFile()) {
		return is_markdown_file(root_path) ? [root_path] : []
	}

	const files: string[] = []
	const walk = async (current_path: string): Promise<void> => {
		const entries = await fs.readdir(current_path, { withFileTypes: true })
		for (const entry of entries) {
			const entry_path = path.join(current_path, entry.name)
			if (entry.isDirectory()) {
				await walk(entry_path)
				continue
			}
			if (entry.isFile() && is_markdown_file(entry_path)) {
				files.push(entry_path)
			}
		}
	}

	await walk(root_path)
	return files.sort((a, b) => a.localeCompare(b))
}

const resolve_project = async (client: StrataApiClient, project_name: string): Promise<{ id: string; name: string }> => {
	const created = await client.createProject({ name: normalize_project_name(project_name) })
	return created
}

export const register_projects_commands = (
	program: Command,
	get_context: (command: Command) => RuntimeContext,
): void => {
	const projects = program.command('projects').description('Manage Strata projects and bulk markdown imports.')

	projects
		.command('list')
		.description('List projects and note counts.')
		.action(async function () {
			const { options, client } = get_context(this)
			const [project_list, notes] = await Promise.all([client.listProjects(), client.listNotes({ includeDeleted: false })])
			const note_counts = new Map<string, number>()
			for (const note of notes) {
				if (!note.projectId) continue
				note_counts.set(note.projectId, (note_counts.get(note.projectId) ?? 0) + 1)
			}
			const data = {
				projects: project_list,
				count: project_list.length,
			}
			if ('pretty' === options.outputMode && !options.quiet) {
				const rows = project_list.map((project) => [
					String(project.sortOrder + 1),
					project.id.slice(0, 8),
					project.name,
					String(note_counts.get(project.id) ?? 0),
				])
				print_success(options, data, { prettyText: format_table(['Order', 'ID', 'Project', 'Notes'], rows) })
				return
			}
			print_success(options, data)
		})

	projects
		.command('create <name>')
		.description('Create a project.')
		.action(async function (name: string) {
			const { options, client } = get_context(this)
			const project = await client.createProject({ name: normalize_project_name(name) })
			print_success(options, { project })
		})

	projects
		.command('rename <projectId> <name>')
		.description('Rename a project.')
		.action(async function (project_id: string, name: string) {
			const { options, client } = get_context(this)
			if (!name.trim()) {
				throw new CliError({ message: 'Project name is required', code: 'INVALID_PROJECT_NAME' })
			}
			const project = await client.updateProject(project_id, { name: normalize_project_name(name) })
			if (!project) {
				throw new CliError({ message: `Project not found: ${project_id}`, code: 'PROJECT_NOT_FOUND' })
			}
			print_success(options, { project })
		})

	projects
		.command('delete <projectId>')
		.description('Delete a project and unassign its notes.')
		.action(async function (project_id: string) {
			const { options, client } = get_context(this)
			const deleted = await client.deleteProject(project_id)
			print_success(options, { deleted })
		})

	projects
		.command('reorder <projectIds...>')
		.description('Reorder projects by id, preserving the supplied sequence.')
		.action(async function (project_ids: string[]) {
			const { options, client } = get_context(this)
			const projects = await client.reorderProjects(project_ids)
			print_success(options, { projects })
		})

	projects
		.command('import <path>')
		.description('Import a folder of markdown files as a project, or a single markdown file as a note.')
		.option('--project <name>', 'Override the project name (defaults to folder name)')
		.action(async function (input_path: string, command_options: { project?: string }) {
			const { options, client } = get_context(this)
			const stat = await fs.stat(input_path)

			if (stat.isFile()) {
				if (!is_markdown_file(input_path)) {
					throw new CliError({
						message: `Not a markdown file: ${input_path}`,
						code: 'INVALID_INPUT',
					})
				}
				const content = await fs.readFile(input_path, 'utf-8')
				const title = derive_title_from_markdown(content)
				const payload = note_create_patch_schema.parse({
					content: content.trim().startsWith('# ') ? content : `# ${title}\n\n${content}`,
				})
				const note = await client.createNote(payload)
				print_success(options, { ok: true, note })
				return
			}

			const project_name = normalize_project_name(command_options.project || path.basename(input_path))
			const file_paths = await collect_markdown_files(input_path)
			if (0 === file_paths.length) {
				throw new CliError({
					message: `No markdown files found in folder: ${input_path}`,
					code: 'NO_MARKDOWN_FILES',
				})
			}

			if (options.dryRun) {
				print_success(options, {
					action: 'projects.import',
					project: { name: project_name },
					count: file_paths.length,
					filePaths: file_paths,
				}, { dryRun: true })
				return
			}

			const project = await resolve_project(client, project_name)
			const imported_notes = []
			for (const file_path of file_paths) {
				const content = await fs.readFile(file_path, 'utf-8')
				const fallback_title = path.basename(file_path, path.extname(file_path))
				const note_content = content.trim().startsWith('# ') ? content : `# ${derive_title_from_markdown(content) || fallback_title}\n\n${content}`
				const note = await client.createNote({
					content: note_content,
					projectId: project.id,
				})
				imported_notes.push(note)
			}

			print_success(options, {
				ok: true,
				project,
				count: imported_notes.length,
				notes: imported_notes,
			})
		})
}
