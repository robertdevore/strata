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
    .description('Search notes with synchronous lexical substring matching.')
    .option('--tag <tag>', 'Optional exact tag filter.')
    .option('--project <name>', 'Optional project name filter.')
    .option('--project-id <id>', 'Optional project ID filter.')
    .option('--limit <count>', 'Max notes to return.', '25')
    .option('--cursor <cursor>', 'Continue this search')
    .action(async function (
      query: string,
      command_options: { tag?: string; project?: string; projectId?: string; limit: string; cursor?: string },
    ) {
      const { options, client } = get_context(this)
      const limit = Math.max(1, Math.min(100, Number.parseInt(command_options.limit, 10) || 25))
      const project_id =
        command_options.projectId ??
        (command_options.project
          ? (await client.listProjects()).find(
              (project) => project.name.toLowerCase() === command_options.project!.trim().toLowerCase(),
            )?.id
          : undefined)
      if (command_options.project && !project_id) {
        throw new CliError({
          message: `Project not found: ${command_options.project}`,
          code: 'PROJECT_NOT_FOUND',
        })
      }
      const page = await client.listNotesPage({
        query,
        limit,
        tag: command_options.tag,
        projectId: project_id,
        cursor: command_options.cursor,
      })
      const notes = page.notes

      const data = {
        query,
        count: notes.length,
        nextCursor: page.nextCursor ?? null,
        notes: notes.map((note) =>
          Object.fromEntries(Object.entries(note).filter(([key]) => key !== 'content')),
        ),
      }

      if ('pretty' === options.outputMode && !options.quiet) {
        const project_names = new Map(
          (await client.listProjects()).map((project) => [project.id, project.name]),
        )
        const rows = notes.map((note) => [
          note.id.slice(0, 8),
          note.updatedAt,
          note.projectId ? (project_names.get(note.projectId) ?? note.projectId.slice(0, 8)) : '',
          note.tags.join(','),
          note.title ?? derive_title_from_markdown(note.content || note.snippet || ''),
        ])
        const table = format_table(['ID', 'Updated', 'Project', 'Tags', 'Title'], rows)
        print_success(options, data, { prettyText: table })
        return
      }

      print_success(options, data)
    })
}
