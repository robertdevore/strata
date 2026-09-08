import { z } from 'zod'
import { CliError } from './errors'
import { ExitCode, type CliRuntimeOptions } from '../types'
import type { StrataApiClient } from './apiClient'
import { note_list_response_schema } from './validators'
import { print_success, format_table } from './output'
import { derive_title_from_markdown } from './markdown'

export interface NoteOutputFlags {
  fields?: string
  idsOnly?: boolean
  count?: boolean
  full?: boolean
}
const allowedFields = new Set([
  'id',
  'title',
  'snippet',
  'content',
  'revision',
  'createdAt',
  'updatedAt',
  'starred',
  'archived',
  'tags',
  'projectId',
  'deletedAt',
])

export const noteOutputFields = (flags: NoteOutputFlags): string[] | undefined => {
  if (flags.fields === undefined) return
  const fields = flags.fields.split(',').map((field) => field.trim())
  if (fields.some((field) => !allowedFields.has(field)) || (fields.includes('content') && !flags.full))
    throw new CliError({
      code: 'INVALID_FIELDS',
      exitCode: ExitCode.ValidationError,
      message: 'Choose valid note fields; content requires --full.',
    })
  return [...new Set(fields)]
}

export const notePageLimit = (value: string): number => {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100)
    throw new CliError({
      code: 'INVALID_LIMIT',
      exitCode: ExitCode.ValidationError,
      message: 'Limit must be an integer from 1 to 100.',
    })
  return Number(value)
}

export const printNotePage = async (
  client: StrataApiClient,
  options: CliRuntimeOptions,
  page: z.infer<typeof note_list_response_schema>,
  flags: NoteOutputFlags,
  extra: Record<string, unknown> = {},
): Promise<void> => {
  const fields = noteOutputFields(flags)
  const result =
    flags.full && !flags.idsOnly && !flags.count
      ? await Promise.all(page.notes.map((note) => client.getNote(note.id)))
      : page.notes
  const data = {
    ...extra,
    count: result.length,
    nextCursor: page.nextCursor ?? null,
    ...(flags.count
      ? {}
      : {
          notes: flags.idsOnly
            ? result.map((note) => note.id)
            : result.map((note) =>
                Object.fromEntries(
                  Object.entries(note).filter(
                    ([key]) => (flags.full || key !== 'content') && (!fields || fields.includes(key)),
                  ),
                ),
              ),
        }),
  }
  if (
    options.outputMode === 'pretty' &&
    !options.quiet &&
    !flags.idsOnly &&
    !flags.count &&
    !fields &&
    !flags.full
  ) {
    const projects = new Map((await client.listProjects()).map((project) => [project.id, project.name]))
    const rows = result.map((note) => [
      note.id.slice(0, 8),
      note.updatedAt,
      note.projectId ? (projects.get(note.projectId) ?? note.projectId.slice(0, 8)) : '',
      note.tags.join(','),
      note.title ?? derive_title_from_markdown(note.content || note.snippet || ''),
    ])
    print_success(options, data, {
      prettyText: format_table(['ID', 'Updated', 'Project', 'Tags', 'Title'], rows),
    })
  } else {
    print_success(options, data)
  }
}
