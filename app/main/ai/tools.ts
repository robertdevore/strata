// Strata AI — tool definitions and execution
// Provides tool schemas for AI providers and executes tool calls against the database.

import type { StrataDatabase } from '../db/index'
import type { AiToolDefinition, NormalizedToolCall } from './types'
import type { Note } from '../../shared/types'

// ---- Tool Definitions ----

export const AI_TOOLS: AiToolDefinition[] = [
	{
		type: 'function',
		name: 'list_notes',
		description: 'List notes with full visibility for analysis tasks.',
		parameters: {
			type: 'object',
			properties: {
				limit: { type: 'number', minimum: 1, maximum: 200 },
				include_archived: { type: 'boolean' },
			},
		},
	},
	{
		type: 'function',
		name: 'search_notes',
		description: 'Search notes by content or tags.',
		parameters: {
			type: 'object',
			properties: {
				query: { type: 'string' },
				limit: { type: 'number', minimum: 1, maximum: 200 },
			},
			required: ['query'],
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
		description: 'Get one note by title (case-insensitive). Useful when the user names a note but does not provide an id.',
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
			},
		},
	},
	{
		type: 'function',
		name: 'update_note',
		description: 'Edit an existing note by id. Can replace content, append content, and update tags/star/archive.',
		parameters: {
			type: 'object',
			properties: {
				note_id: { type: 'string' },
				content: { type: 'string' },
				append_content: { type: 'string' },
				tags: { type: 'array', items: { type: 'string' } },
				starred: { type: 'boolean' },
				archived: { type: 'boolean' },
			},
			required: ['note_id'],
		},
	},
	{
		type: 'function',
		name: 'update_note_by_title',
		description: 'Edit an existing note by title when note_id is not known. Can replace content, append content, and update tags/star/archive.',
		parameters: {
			type: 'object',
			properties: {
				title: { type: 'string' },
				content: { type: 'string' },
				append_content: { type: 'string' },
				tags: { type: 'array', items: { type: 'string' } },
				starred: { type: 'boolean' },
				archived: { type: 'boolean' },
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
				limit: { type: 'number', minimum: 1, maximum: 200 },
			},
			required: ['thread_id'],
		},
	},
] as const

// ---- Tool execution context ----

export interface ToolExecutionContext {
	threadId?: string
	messageId?: string
	model?: string
}

export interface ToolExecutionResult {
	output: string
	notesChanged: boolean
}

// ---- Helpers ----

const parse_tool_args = (raw: string): Record<string, unknown> => {
	if (!raw) return {}
	try {
		const parsed = JSON.parse(raw) as unknown
		if (parsed && 'object' === typeof parsed && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>
		}
		return {}
	} catch {
		return {}
	}
}

const normalize_tags = (value: unknown): string[] => {
	if (!Array.isArray(value)) return []
	const tags = value
		.filter((item): item is string => 'string' === typeof item)
		.map((item) => item.trim())
		.filter(Boolean)
	return [...new Set(tags)]
}

const derive_note_title = (content: string): string => {
	const lines = content.split(/\r?\n/)
	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed) continue
		const unprefixed = trimmed.replace(/^#+\s*/, '').trim()
		if (unprefixed) return unprefixed.length <= 80 ? unprefixed : `${unprefixed.slice(0, 77)}...`
	}
	return 'Untitled'
}

const normalize_note_title = (title: string): string => title.replace(/\s+/g, ' ').trim().toLowerCase()

const format_title_matches = (items: Array<{ note: Note; title: string }>): Array<{ id: string; title: string; updatedAt: string }> => {
	return items
		.slice(0, 10)
		.map((item) => ({
			id: item.note.id,
			title: item.title,
			updatedAt: item.note.updatedAt,
		}))
}

const resolve_note_by_title = (
	db: StrataDatabase,
	raw_title: string,
): { note: Note | null; matches: Array<{ id: string; title: string; updatedAt: string }> } => {
	const title_query = normalize_note_title(raw_title)
	if (!title_query) {
		return { note: null, matches: [] }
	}

	const notes = db.listNotes({ includeDeleted: false })
	const titled_notes = notes.map((note) => ({ note, title: derive_note_title(note.content) }))

	const exact_matches = titled_notes.filter((item) => normalize_note_title(item.title) === title_query)
	if (1 === exact_matches.length) {
		return { note: exact_matches[0].note, matches: [] }
	}
	if (exact_matches.length > 1) {
		return { note: null, matches: format_title_matches(exact_matches) }
	}

	const contains_matches = titled_notes.filter((item) => normalize_note_title(item.title).includes(title_query))
	if (1 === contains_matches.length) {
		return { note: contains_matches[0].note, matches: [] }
	}
	if (contains_matches.length > 1) {
		return { note: null, matches: format_title_matches(contains_matches) }
	}

	return { note: null, matches: [] }
}

const summarize_notes = (notes: ReturnType<StrataDatabase['aiListNotes']>) => {
	return notes.map((note: { id: string; content: string; updatedAt: string; starred: boolean; archived: boolean; tags: string[] }) => ({
		id: note.id,
		title: derive_note_title(note.content),
		updatedAt: note.updatedAt,
		starred: note.starred,
		archived: note.archived,
		tags: note.tags,
		excerpt: note.content.slice(0, 500),
	}))
}

// ---- Tool Execution ----

export const execute_tool_call = (
	db: StrataDatabase,
	tool_call: NormalizedToolCall,
	ctx?: ToolExecutionContext,
): ToolExecutionResult => {
	const args = parse_tool_args(tool_call.argumentsJson)
	const tool_name = tool_call.name

	if ('list_notes' === tool_name) {
		const limit = 'number' === typeof args.limit ? args.limit : 60
		const include_archived = 'boolean' === typeof args.include_archived ? args.include_archived : true
		return {
			output: JSON.stringify({ notes: summarize_notes(db.aiListNotes(limit, include_archived)) }),
			notesChanged: false,
		}
	}

	if ('search_notes' === tool_name) {
		const query = 'string' === typeof args.query ? args.query.trim() : ''
		const limit = 'number' === typeof args.limit ? args.limit : 25
		if (!query) return { output: JSON.stringify({ notes: [] }), notesChanged: false }
		return {
			output: JSON.stringify({ notes: summarize_notes(db.aiSearchNotes(query, limit)) }),
			notesChanged: false,
		}
	}

	if ('get_note' === tool_name) {
		const note_id = 'string' === typeof args.note_id ? args.note_id : ''
		const include_deleted = true === args.include_deleted
		if (!note_id) return { output: JSON.stringify({ note: null }), notesChanged: false }
		return {
			output: JSON.stringify({ note: db.aiGetNoteById(note_id, include_deleted) }),
			notesChanged: false,
		}
	}

	if ('get_note_by_title' === tool_name) {
		const title = 'string' === typeof args.title ? args.title : ''
		if (!title.trim()) return { output: JSON.stringify({ error: 'title is required', note: null }), notesChanged: false }

		const resolved = resolve_note_by_title(db, title)
		if (!resolved.note) {
			if (resolved.matches.length) {
				return {
					output: JSON.stringify({
						error: 'multiple notes matched title',
						note: null,
						matches: resolved.matches,
					}),
					notesChanged: false,
				}
			}
			return { output: JSON.stringify({ error: 'note not found by title', note: null }), notesChanged: false }
		}

		return {
			output: JSON.stringify({ note: resolved.note }),
			notesChanged: false,
		}
	}

	if ('create_note' === tool_name) {
		const settings = db.getSettings()
		if ('read_only' === settings.aiEditMode) {
			return { output: JSON.stringify({ error: 'AI note editing is disabled (aiEditMode: read_only)' }), notesChanged: false }
		}
		const created = db.createNote()
		const patch: Record<string, unknown> = {}
		if ('string' === typeof args.content) patch.content = args.content
		if ('boolean' === typeof args.starred) patch.starred = args.starred
		if ('boolean' === typeof args.archived) patch.archived = args.archived
		const tags = normalize_tags(args.tags)
		if (tags.length) patch.tags = tags
		const updated = Object.keys(patch).length ? db.updateNote(created.id, patch) : created
		const final_note = updated ?? created

		// Record AI edit
		db.recordAiEdit({
			noteId: final_note.id,
			threadId: ctx?.threadId ?? null,
			messageId: ctx?.messageId ?? null,
			action: 'create',
			afterContent: final_note.content,
			afterTags: final_note.tags,
			model: ctx?.model ?? null,
			promptExcerpt: typeof args.content === 'string' ? args.content.slice(0, 200) : null,
		})

		return {
			output: JSON.stringify({ note: final_note }),
			notesChanged: true,
		}
	}

	if ('update_note' === tool_name) {
		const settings = db.getSettings()
		if ('read_only' === settings.aiEditMode) {
			return { output: JSON.stringify({ error: 'AI note editing is disabled (aiEditMode: read_only)' }), notesChanged: false }
		}
		const note_id = 'string' === typeof args.note_id ? args.note_id : ''
		if (!note_id) return { output: JSON.stringify({ error: 'note_id is required' }), notesChanged: false }
		const current = db.aiGetNoteById(note_id)
		if (!current) return { output: JSON.stringify({ error: 'note not found', note: null }), notesChanged: false }

		const patch: Record<string, unknown> = {}
		if ('string' === typeof args.content) {
			patch.content = args.content
		}
		if ('string' === typeof args.append_content) {
			patch.content = `${current.content}${args.append_content}`
		}
		if ('boolean' === typeof args.starred) patch.starred = args.starred
		if ('boolean' === typeof args.archived) patch.archived = args.archived
		if (Array.isArray(args.tags)) patch.tags = normalize_tags(args.tags)

		if (0 === Object.keys(patch).length) {
			return { output: JSON.stringify({ note: current, unchanged: true }), notesChanged: false }
		}

		const before_content = current.content
		const before_tags = current.tags

		const updated = db.updateNote(note_id, patch)

		// Record AI edit
		if (updated) {
			db.recordAiEdit({
				noteId: note_id,
				threadId: ctx?.threadId ?? null,
				messageId: ctx?.messageId ?? null,
				action: 'update',
				beforeContent: before_content,
				afterContent: updated.content,
				beforeTags: before_tags,
				afterTags: updated.tags,
				model: ctx?.model ?? null,
				promptExcerpt: typeof args.content === 'string' ? args.content.slice(0, 200) : null,
			})
		}

		return {
			output: JSON.stringify({ note: updated }),
			notesChanged: Boolean(updated),
		}
	}

	if ('update_note_by_title' === tool_name) {
		const settings = db.getSettings()
		if ('read_only' === settings.aiEditMode) {
			return { output: JSON.stringify({ error: 'AI note editing is disabled (aiEditMode: read_only)' }), notesChanged: false }
		}

		const title = 'string' === typeof args.title ? args.title : ''
		if (!title.trim()) return { output: JSON.stringify({ error: 'title is required' }), notesChanged: false }

		const resolved = resolve_note_by_title(db, title)
		if (!resolved.note) {
			if (resolved.matches.length) {
				return {
					output: JSON.stringify({
						error: 'multiple notes matched title',
						note: null,
						matches: resolved.matches,
					}),
					notesChanged: false,
				}
			}
			return { output: JSON.stringify({ error: 'note not found by title', note: null }), notesChanged: false }
		}

		const current = resolved.note
		const note_id = current.id
		const patch: Record<string, unknown> = {}
		if ('string' === typeof args.content) {
			patch.content = args.content
		}
		if ('string' === typeof args.append_content) {
			patch.content = `${current.content}${args.append_content}`
		}
		if ('boolean' === typeof args.starred) patch.starred = args.starred
		if ('boolean' === typeof args.archived) patch.archived = args.archived
		if (Array.isArray(args.tags)) patch.tags = normalize_tags(args.tags)

		if (0 === Object.keys(patch).length) {
			return { output: JSON.stringify({ note: current, unchanged: true }), notesChanged: false }
		}

		const before_content = current.content
		const before_tags = current.tags
		const updated = db.updateNote(note_id, patch)

		if (updated) {
			db.recordAiEdit({
				noteId: note_id,
				threadId: ctx?.threadId ?? null,
				messageId: ctx?.messageId ?? null,
				action: 'update',
				beforeContent: before_content,
				afterContent: updated.content,
				beforeTags: before_tags,
				afterTags: updated.tags,
				model: ctx?.model ?? null,
				promptExcerpt: typeof args.content === 'string' ? args.content.slice(0, 200) : null,
			})
		}

		return {
			output: JSON.stringify({ note: updated }),
			notesChanged: Boolean(updated),
		}
	}

	if ('search_chats' === tool_name) {
		const query = 'string' === typeof args.query ? args.query.trim() : ''
		const limit = 'number' === typeof args.limit ? args.limit : 30
		if (!query) return { output: JSON.stringify({ results: [] }), notesChanged: false }
		return {
			output: JSON.stringify({ results: db.searchAiMessages(query, limit) }),
			notesChanged: false,
		}
	}

	if ('get_chat_thread' === tool_name) {
		const thread_id = 'string' === typeof args.thread_id ? args.thread_id : ''
		const limit = 'number' === typeof args.limit ? args.limit : 120
		if (!thread_id) return { output: JSON.stringify({ thread: null, messages: [] }), notesChanged: false }
		const thread = db.getAiThread(thread_id)
		if (!thread) return { output: JSON.stringify({ thread: null, messages: [] }), notesChanged: false }
		const messages = db.listAiMessages(thread_id).slice(-Math.max(1, Math.min(200, limit)))
		return {
			output: JSON.stringify({ thread, messages }),
			notesChanged: false,
		}
	}

	return {
		output: JSON.stringify({ error: `Unsupported tool: ${tool_name}` }),
		notesChanged: false,
	}
}

export { derive_note_title, summarize_notes }
