import { Command } from 'commander'
import { notePageLimit, noteOutputFields, printNotePage, type NoteOutputFlags } from '../lib/noteOutput'
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
    .description('Search notes with ranked local FTS and substring fallback.')
    .option('--tag <tag>', 'Optional exact tag filter.')
    .option('--project <name>', 'Optional project name filter.')
    .option('--project-id <id>', 'Optional project ID filter.')
    .option('--limit <count>', 'Max notes to return.', '25')
    .option('--cursor <cursor>', 'Continue this search')
    .option('--fields <fields>', 'Comma-separated summary fields')
    .option('--ids-only', 'Return only note IDs')
    .option('--count', 'Return only the page count')
    .option('--full', 'Explicitly fetch full records for this page')
    .action(async function (
      query: string,
      command_options: NoteOutputFlags & {
        tag?: string
        project?: string
        projectId?: string
        limit: string
        cursor?: string
      },
    ) {
      const { options, client } = get_context(this)
      const limit = notePageLimit(command_options.limit)
      noteOutputFields(command_options)
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
      await printNotePage(client, options, page, command_options, { query })
    })
}
