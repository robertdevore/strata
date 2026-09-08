import type { MutationOutcome } from './execution'
import { NO_CHANGED, type ChangedDomains } from '../../shared/changedDomains'
// Strata AI — tool definitions and execution
// Provides tool schemas for AI providers and executes tool calls against the database.

import type { StrataDatabase } from '../db/index'
import type { AiToolDefinition, NormalizedToolCall } from './types'
import { z } from 'zod'
import { KnowledgeService, operationSchema } from '../services/knowledgeService'
import { DomainError } from '../../shared/errors'
import { deriveNoteTitle } from '../../shared/noteTitle'
import type { Note } from '../../shared/types'

// ---- Tool Definitions ----

export const AI_TOOLS: AiToolDefinition[] = [
  {
    type: 'function',
    name: 'list_notes',
    description:
      'List compact summaries (default 15). Fetch specific notes with get_note only when full text is needed.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100 },
        include_archived: { type: 'boolean' },
      },
    },
  },
  {
    type: 'function',
    name: 'search_notes',
    description:
      'Search notes by lexical substring across content, tags, and project names. Use this when the user provides exact keywords or phrases.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'search_notes_by_tag',
    description:
      'Search notes that have a specific tag. Use this when the user mentions a tag name (e.g., "review", "dev", "security") to find all notes with that tag.',
    parameters: {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
          description: 'The exact tag name to search for (e.g., "review", "dev", "bug")',
        },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      required: ['tag'],
    },
  },
  {
    type: 'function',
    name: 'list_projects',
    description: 'List all projects for organization and categorization.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'get_project',
    description: 'Get a project by id or by exact project name.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        project_name: { type: 'string' },
      },
    },
  },
  {
    type: 'function',
    name: 'search_notes_by_project',
    description: 'List notes that belong to a specific project or category.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        project_name: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
    },
  },
  {
    type: 'function',
    name: 'create_project',
    description: 'Create a new project/category.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    type: 'function',
    name: 'update_project',
    description: 'Rename an existing project.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        project_name: { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
  {
    type: 'function',
    name: 'delete_project',
    description: 'Delete a project and unassign its notes.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
      },
      required: ['project_id'],
    },
  },
  {
    type: 'function',
    name: 'reorder_projects',
    description: 'Reorder projects by supplying the desired project id sequence.',
    parameters: {
      type: 'object',
      properties: {
        project_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_ids'],
    },
  },
  {
    type: 'function',
    name: 'get_note',
    description: 'Get one note by note id for deep analysis.',
    parameters: {
      type: 'object',
      properties: {
        note_id: { type: 'string' },
        include_deleted: { type: 'boolean' },
      },
      required: ['note_id'],
    },
  },
  {
    type: 'function',
    name: 'get_note_by_title',
    description:
      'Get one note by title (case-insensitive). Useful when the user names a note but does not provide an id.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    type: 'function',
    name: 'create_note',
    description: 'Create a new note and optionally set content/tags/star/archive flags.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        starred: { type: 'boolean' },
        archived: { type: 'boolean' },
        project_id: { type: 'string' },
        project_name: { type: 'string' },
      },
    },
  },
  {
    type: 'function',
    name: 'update_note',
    description:
      'Edit an existing note by id. Can replace content, append content, and update tags/star/archive.',
    parameters: {
      type: 'object',
      properties: {
        note_id: { type: 'string' },
        content: { type: 'string' },
        append_content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        starred: { type: 'boolean' },
        archived: { type: 'boolean' },
        project_id: { type: 'string' },
        project_name: { type: 'string' },
      },
      required: ['note_id'],
    },
  },
  {
    type: 'function',
    name: 'update_note_by_title',
    description:
      'Edit an existing note by title when note_id is not known. Can replace content, append content, and update tags/star/archive.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        append_content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        starred: { type: 'boolean' },
        archived: { type: 'boolean' },
        project_id: { type: 'string' },
        project_name: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    type: 'function',
    name: 'search_chats',
    description: 'Search previous chat messages.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'get_chat_thread',
    description: 'Get messages from a previous chat thread by id.',
    parameters: {
      type: 'object',
      properties: {
        thread_id: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      required: ['thread_id'],
    },
  },
] as const

export interface ToolExecutionContext {
  threadId?: string
  messageId?: string
  model?: string
}
export interface ToolExecutionResult {
  output: string
  changed: ChangedDomains
  proposalId?: string
  mutation?: MutationOutcome
}
const mutations = new Set([
  'create_note',
  'update_note',
  'update_note_by_title',
  'create_project',
  'update_project',
  'delete_project',
  'reorder_projects',
])
/** Permission-based selection keeps every read tool and never guesses the user's intent. */
export const toolsForMode = (mode: unknown): AiToolDefinition[] =>
  mode === 'confirm' || mode === 'auto_apply'
    ? [...AI_TOOLS]
    : AI_TOOLS.filter((tool) => !mutations.has(tool.name))

for (const tool of AI_TOOLS) {
  if (tool.name === 'update_note' || tool.name === 'update_note_by_title') {
    tool.parameters.properties.expected_revision = {
      type: 'integer',
      minimum: 1,
      description: 'Revision returned by get_note; required to prevent overwriting newer edits.',
    }
    tool.parameters.required = [...(tool.parameters.required ?? []), 'expected_revision']
  }
}
const fieldSchema = (name: string, definition: unknown): z.ZodType => {
  const field = definition as { type: string }
  if (name === 'expected_revision') return z.number().int().positive()
  if (name === 'limit') return z.number().int().min(1).max(100)
  if (name.endsWith('_ids')) return z.array(z.string().uuid()).min(1).max(1000)
  if (name.endsWith('_id')) return z.string().uuid()
  if (name === 'tags') return z.array(z.string().trim().min(1).max(120)).max(100)
  if (field.type === 'boolean') return z.boolean()
  if (field.type === 'string')
    return z.string().max(['content', 'append_content'].includes(name) ? 800000 : 500)
  throw new Error(`Missing runtime schema for ${name}`)
}
const schemas = new Map(
  AI_TOOLS.map((tool) => [
    tool.name,
    z
      .object(
        Object.fromEntries(
          Object.entries(tool.parameters.properties).map(([name, field]) => {
            const schema = fieldSchema(name, field)
            return [name, tool.parameters.required?.includes(name) ? schema : schema.optional()]
          }),
        ),
      )
      .strict(),
  ]),
)
export const summarize_notes = (notes: Note[]) =>
  notes.map((note) => ({
    id: note.id,
    title: note.title ?? deriveNoteTitle(note.content),
    revision: note.revision,
    updatedAt: note.updatedAt,
    projectId: note.projectId,
    tags: note.tags,
    starred: note.starred,
    archived: note.archived,
    snippet: note.content.slice(0, 200),
  }))
const byTitle = (db: StrataDatabase, title: string): Note => {
  const matches = db.findNotesByTitle(title)
  if (matches.length !== 1)
    throw new DomainError(
      matches.length ? 'AMBIGUOUS_TITLE' : 'NOT_FOUND',
      matches.length ? 'Multiple notes have this title' : 'Note not found',
      { matches: matches.map((note) => ({ id: note.id, title: note.title, revision: note.revision })) },
    )
  return matches[0]
}
export const execute_tool_call = (
  db: StrataDatabase,
  call: NormalizedToolCall,
  ctx?: ToolExecutionContext,
): ToolExecutionResult => {
  try {
    const schema = schemas.get(call.name)
    if (!schema) throw new DomainError('UNSUPPORTED_TOOL', 'Unsupported tool')
    if (call.argumentsJson.length > 1024 * 1024)
      throw new DomainError('VALIDATION_ERROR', 'Tool arguments too large')
    const args = schema.parse(JSON.parse(call.argumentsJson)) as Record<string, unknown>
    const limit = typeof args.limit === 'number' ? args.limit : 15
    const project = () =>
      args.project_id
        ? db.getProject(String(args.project_id))
        : db.getProjectByName(String(args.project_name ?? ''))
    let result: unknown
    if (mutations.has(call.name)) {
      if (ctx?.threadId && !db.getAiThread(ctx.threadId))
        throw new DomainError('CANCELLED', 'Chat was deleted')
      const mode = db.getSettings().aiEditMode
      if (mode !== 'confirm' && mode !== 'auto_apply')
        throw new DomainError('READ_ONLY', 'AI mutations are disabled')
      let changed = { ...NO_CHANGED }
      const service = new KnowledgeService(db, (domains) => {
        changed = domains
      })
      let operation: unknown
      if (['create_note', 'update_note', 'update_note_by_title'].includes(call.name)) {
        const current =
          call.name === 'update_note_by_title'
            ? byTitle(db, String(args.title))
            : call.name === 'update_note'
              ? db.getNote(String(args.note_id))
              : null
        if (call.name !== 'create_note' && !current) throw new DomainError('NOT_FOUND', 'Note not found')
        if (args.content !== undefined && args.append_content !== undefined)
          throw new DomainError('VALIDATION_ERROR', 'Specify content or append_content')
        const payload: Record<string, unknown> = {}
        for (const field of ['content', 'tags', 'starred', 'archived'])
          if (args[field] !== undefined) payload[field] = args[field]
        if (args.append_content !== undefined)
          payload.content = current!.content + String(args.append_content)
        if (args.project_id !== undefined) payload.projectId = args.project_id
        if (args.project_name !== undefined) payload.projectName = args.project_name
        if (current) payload.expectedRevision = args.expected_revision
        operation = current ? { op: 'update_note', id: current.id, payload } : { op: 'create_note', payload }
      } else if (call.name === 'create_project') operation = { op: 'create_project', name: args.name }
      else if (call.name === 'update_project')
        operation = { op: 'rename_project', id: project()?.id, name: args.name }
      else if (call.name === 'delete_project') operation = { op: 'delete_project', id: args.project_id }
      else operation = { op: 'reorder_projects', projectIds: args.project_ids }
      const parsed = operationSchema.parse(operation)
      if (mode === 'confirm') {
        const proposal = service.propose(parsed, ctx)
        return {
          output: JSON.stringify({
            status: 'awaiting_approval',
            proposalId: proposal.id,
            operation: parsed.op,
          }),
          changed: { ...NO_CHANGED },
          proposalId: proposal.id,
          mutation: { operation: parsed.op, status: 'proposed', proposalId: proposal.id, entities: [] },
        }
      }
      const deletedProject = parsed.op === 'delete_project' ? db.getProject(parsed.id) : null
      result = service.mutate(parsed, { source: 'ai' })
      const values = (Array.isArray(result) ? result : [result]) as Array<Record<string, unknown>>
      const kind = ['create_note', 'update_note'].includes(parsed.op) ? 'note' : 'project'
      const targets = parsed.op === 'reorder_projects' ? new Set(parsed.projectIds) : undefined
      const entities: MutationOutcome['entities'] = values
        .filter((value) => value && typeof value.id === 'string' && (!targets || targets.has(value.id)))
        .map((value) => ({
          kind,
          id: String(value.id),
          title:
            typeof value.title === 'string'
              ? value.title
              : typeof value.name === 'string'
                ? value.name
                : undefined,
          ...(typeof value.revision === 'number' ? { revision: value.revision } : {}),
        }))
      if (parsed.op === 'delete_project')
        entities.push({ kind: 'project', id: parsed.id, title: deletedProject?.name })
      const unchanged =
        parsed.op === 'update_note' && entities[0]?.revision === parsed.payload.expectedRevision
      return {
        output: JSON.stringify({ status: unchanged ? 'unchanged' : 'applied', result }),
        changed,
        mutation: { operation: parsed.op, status: unchanged ? 'unchanged' : 'applied', entities },
      }
    }
    switch (call.name) {
      case 'list_notes':
        result = { notes: summarize_notes(db.aiListNotes(limit, args.include_archived !== false)) }
        break
      case 'search_notes':
        result = { notes: summarize_notes(db.aiSearchNotes(String(args.query), limit)) }
        break
      case 'search_notes_by_tag':
        result = { notes: summarize_notes(db.listNoteSummaries({ tag: String(args.tag), limit })) }
        break
      case 'list_projects':
        result = { projects: db.listProjects().slice(0, 100) }
        break
      case 'get_project':
        result = { project: project() }
        break
      case 'search_notes_by_project': {
        const found = project()
        result = {
          project: found,
          notes: found ? summarize_notes(db.listNoteSummaries({ projectId: found.id, limit })) : [],
        }
        break
      }
      case 'get_note':
        result = { note: db.aiGetNoteById(String(args.note_id), args.include_deleted === true) }
        break
      case 'get_note_by_title':
        result = { note: byTitle(db, String(args.title)) }
        break
      case 'search_chats':
        result = {
          results: db.searchAiMessages(String(args.query), limit).map((row) => ({
            ...row,
            message: { ...row.message, content: row.message.content.slice(0, 240) },
          })),
        }
        break
      case 'get_chat_thread':
        result = {
          thread: db.getAiThread(String(args.thread_id)),
          messages: db
            .listAiMessages(String(args.thread_id))
            .slice(-limit)
            .map((message) => ({ ...message, content: message.content.slice(0, 2000) })),
        }
        break
      default:
        throw new DomainError('UNSUPPORTED_TOOL', 'Unsupported tool')
    }
    return { output: JSON.stringify(result), changed: { ...NO_CHANGED } }
  } catch (error) {
    const code = error instanceof DomainError ? error.code : 'VALIDATION_ERROR'
    const message = error instanceof DomainError ? error.message : 'Malformed tool arguments'
    return {
      output: JSON.stringify({
        ok: false,
        error: { code, message, details: error instanceof DomainError ? error.details : {} },
      }),
      changed: { ...NO_CHANGED },
      ...(mutations.has(call.name)
        ? { mutation: { operation: call.name, status: 'failed' as const, errorCode: code, entities: [] } }
        : {}),
    }
  }
}
export { deriveNoteTitle as derive_note_title }
