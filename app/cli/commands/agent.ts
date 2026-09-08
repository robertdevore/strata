import { Command } from 'commander'
import { read_content_input } from '../lib/io'
import {
  derive_title_from_markdown,
  make_markdown_note,
  normalize_tags,
  suggest_tags_from_content,
} from '../lib/markdown'
import { print_success } from '../lib/output'
import type { CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'

interface RuntimeContext {
  options: CliRuntimeOptions
  client: StrataApiClient
}

interface AgentProjectTarget {
  projectId?: string
  projectName?: string
}

interface CaptureOptions {
  file?: string
  stdin?: boolean
  project?: string
  projectId?: string
  source?: string
  session?: string
  dedupe?: boolean
}

interface AgentContextOptions {
  limit: string
  full?: boolean
}

const compact_context_note = (note: Awaited<ReturnType<StrataApiClient['searchNotes']>>[number]) => {
  const title = note.title ?? derive_title_from_markdown(note.content || note.snippet || '')
  const snippet = (note.snippet || note.content)
    .replace(/^#\s+.*$/m, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280)

  return {
    id: note.id,
    revision: note.revision,
    title,
    snippet,
    updatedAt: note.updatedAt,
    projectId: note.projectId,
    tags: note.tags,
    archived: note.archived,
  }
}

const build_agent_note = (text: string, extra_tags: string[]): { content: string; tags: string[] } => {
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  const title = derive_title_from_markdown(trimmed)
  const content = trimmed.startsWith('# ') ? trimmed : make_markdown_note(title, trimmed)
  const auto_tags = suggest_tags_from_content(trimmed)
  const tags = normalize_tags(['agent', ...extra_tags, ...auto_tags]).slice(0, 8)
  return { content, tags }
}

const normalize_project_name = (value: string): string => value.trim().replace(/\s+/g, ' ')

const get_project_target = (project_id?: string, project_name?: string): AgentProjectTarget => {
  if (project_id) return { projectId: project_id }
  if (project_name?.trim()) return { projectName: normalize_project_name(project_name) }
  return {}
}

const create_agent_note = async (
  context: RuntimeContext,
  action: string,
  text: string,
  extra_tags: string[],
  project: AgentProjectTarget = {},
  captureOptions: CaptureOptions = {},
): Promise<void> => {
  const { options, client } = context
  const provenance: string[] = []
  for (const [label, value] of [
    ['Source', captureOptions.source],
    ['Session', captureOptions.session],
  ]) {
    if (!value) continue
    if (value.length > 500) throw new Error(`${label} must be at most 500 characters`)
    provenance.push(`- ${label}: ${JSON.stringify(value)}`)
  }
  const payload = build_agent_note(text, extra_tags)
  if (provenance.length) payload.content += `\n\n## Capture provenance\n${provenance.join('\n')}\n`
  const result = await client.captureMemory(
    { ...payload, ...project },
    captureOptions.dedupe !== false,
    options.dryRun,
  )
  print_success(
    options,
    {
      action: result.duplicate ? 'duplicate_found' : options.dryRun ? 'would_create_note' : 'create_note',
      namespace: action,
      noteId: result.note.id,
      revision: result.note.revision,
      duplicate: result.duplicate,
      tags: result.note.tags,
      link: options.dryRun && !result.duplicate ? undefined : `strata-note://${result.note.id}`,
    },
    { dryRun: options.dryRun },
  )
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
    .option('--project <name>', 'Attach note to a project by name, creating it if needed')
    .option('--project-id <id>', 'Attach note to a project by ID')
    .option('--source <source>', 'Record source provenance in Markdown')
    .option('--session <session>', 'Record session provenance in Markdown')
    .option('--no-dedupe', 'Create a new note even when identical content exists in the project')
    .action(async function (text: string | undefined, command_options: CaptureOptions) {
      const context = get_context(this)
      const input = text?.trim()
        ? text
        : await read_content_input({ file: command_options.file, stdin: command_options.stdin })
      const project = get_project_target(command_options.projectId, command_options.project)
      await create_agent_note(
        context,
        'agent.capture',
        input,
        ['capture', 'implementation'],
        project,
        command_options,
      )
    })

  agent
    .command('decision [text]')
    .description('Capture a decision record note from agent output.')
    .option('--file <path>', 'Read text from file path')
    .option('--stdin', 'Read text from STDIN')
    .option('--project <name>', 'Attach note to a project by name, creating it if needed')
    .option('--project-id <id>', 'Attach note to a project by ID')
    .option('--source <source>', 'Record source provenance in Markdown')
    .option('--session <session>', 'Record session provenance in Markdown')
    .option('--no-dedupe', 'Create a new note even when identical content exists in the project')
    .action(async function (text: string | undefined, command_options: CaptureOptions) {
      const context = get_context(this)
      const input = text?.trim()
        ? text
        : await read_content_input({ file: command_options.file, stdin: command_options.stdin })
      const project = get_project_target(command_options.projectId, command_options.project)
      await create_agent_note(context, 'agent.decision', input, ['decision'], project, command_options)
    })

  agent
    .command('todo [text]')
    .description('Capture actionable TODO notes for agents/humans.')
    .option('--file <path>', 'Read text from file path')
    .option('--stdin', 'Read text from STDIN')
    .option('--project <name>', 'Attach note to a project by name, creating it if needed')
    .option('--project-id <id>', 'Attach note to a project by ID')
    .option('--source <source>', 'Record source provenance in Markdown')
    .option('--session <session>', 'Record session provenance in Markdown')
    .option('--no-dedupe', 'Create a new note even when identical content exists in the project')
    .action(async function (text: string | undefined, command_options: CaptureOptions) {
      const context = get_context(this)
      const input = text?.trim()
        ? text
        : await read_content_input({ file: command_options.file, stdin: command_options.stdin })
      const project = get_project_target(command_options.projectId, command_options.project)
      await create_agent_note(context, 'agent.todo', input, ['todo'], project, command_options)
    })

  agent
    .command('summary')
    .description('Capture summary note from file/stdin content.')
    .option('--file <path>', 'Read text from file path')
    .option('--stdin', 'Read text from STDIN')
    .option('--project <name>', 'Attach note to a project by name, creating it if needed')
    .option('--project-id <id>', 'Attach note to a project by ID')
    .option('--source <source>', 'Record source provenance in Markdown')
    .option('--session <session>', 'Record session provenance in Markdown')
    .option('--no-dedupe', 'Create a new note even when identical content exists in the project')
    .action(async function (command_options: CaptureOptions) {
      const context = get_context(this)
      const input = await read_content_input({ file: command_options.file, stdin: command_options.stdin })
      const project = get_project_target(command_options.projectId, command_options.project)
      await create_agent_note(context, 'agent.summary', input, ['summary'], project, command_options)
    })

  const context = agent
    .command('context')
    .description('Search notes for relevant agent context (non-destructive).')

  context
    .command('search <query>')
    .description('Search notes lexically and return compact context results.')
    .option('--limit <count>', 'Limit result count', '5')
    .option('--full', 'Return complete note records instead of compact results')
    .action(async function (query: string, command_options: AgentContextOptions) {
      const { options, client } = get_context(this)
      const limit = Math.max(1, Math.min(50, Number.parseInt(command_options.limit, 10) || 5))
      const notes = await client.searchNotes(query, limit)
      print_success(options, {
        action: 'search',
        query,
        count: notes.length,
        compact: !command_options.full,
        notes: command_options.full
          ? await Promise.all(notes.map((note) => client.getNote(note.id)))
          : notes.map(compact_context_note),
      })
    })
}
