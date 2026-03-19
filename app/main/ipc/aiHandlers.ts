import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { AiChatResponse, AiMessage, AiThread } from '../../shared/types'
import type { StrataDatabase } from '../db/index'

const thread_id_schema = z.object({ threadId: z.string().uuid() })
const search_schema = z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(100).optional() })
const send_schema = z.object({
	threadId: z.string().uuid().optional(),
	message: z.string().trim().min(1).max(12000),
})
const transcribe_schema = z.object({
	base64Audio: z.string().trim().min(1),
	mimeType: z.string().trim().min(1).max(120),
	prompt: z.string().trim().max(1200).optional(),
	language: z.string().trim().min(2).max(8).optional(),
})

const extract_transcription_text = (payload: unknown): string => {
	if (!payload || 'object' !== typeof payload) return ''
	const record = payload as Record<string, unknown>
	if ('string' === typeof record.text) return record.text.trim()
	if ('string' === typeof record.transcript) return record.transcript.trim()
	if (Array.isArray(record.segments)) {
		const joined = record.segments
			.map((segment) => ('object' === typeof segment && segment && 'string' === typeof (segment as Record<string, unknown>).text ? (segment as Record<string, unknown>).text : ''))
			.filter(Boolean)
			.join(' ')
			.trim()
		if (joined) return joined
	}
	return ''
}

const sanitize_transcription_text = (value: string): string => {
	if (!value) return ''
	let normalized = value.replace(/\s+/g, ' ').trim()

	const junk_patterns = [
		/^transcription by\s+.+$/i,
		/^translation by\s+.+$/i,
		/^transcription by\s+.+\s+translation by\s+.+$/i,
	]

	for (const pattern of junk_patterns) {
		if (pattern.test(normalized)) {
			normalized = ''
			break
		}
	}

	if (!normalized) return ''

	normalized = normalized
		.replace(/\btranscription by\s+[^.?!]+[.?!]?\s*/gi, '')
		.replace(/\btranslation by\s+[^.?!]+[.?!]?\s*/gi, '')
		.replace(/\s+/g, ' ')
		.trim()

	return normalized
}

interface OpenAiInputMessageItem {
	role: 'system' | 'user' | 'assistant'
	content: string
}

interface OpenAiFunctionCallOutputItem {
	type: 'function_call_output'
	call_id: string
	output: string
}

interface OpenAiResponseTextContentItem {
	type: 'output_text'
	text: string
}

interface OpenAiResponseOutputItem {
	type: string
	name?: string
	arguments?: string
	call_id?: string
	content?: OpenAiResponseTextContentItem[]
}

interface OpenAiResponsesPayload {
	output?: OpenAiResponseOutputItem[]
	output_text?: string
}

type OpenAiInputItem = OpenAiInputMessageItem | OpenAiFunctionCallOutputItem | OpenAiResponseOutputItem

interface ToolExecutionResult {
	output: string
	notesChanged: boolean
}

interface AiTurnResult {
	content: string
	notesChanged: boolean
}

const note_id_pattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

const ai_tools = [
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

const resolve_api_key = (db: StrataDatabase): string => {
	const from_env = process.env.STRATA_OPENAI_API_KEY?.trim()
	if (from_env) return from_env
	const from_settings = db.getSettings().openAiApiKey?.trim()
	if (from_settings) return from_settings
	throw new Error('AI is not configured. Set STRATA_OPENAI_API_KEY or add an OpenAI API Key in Settings.')
}

const derive_chat_title = (message: string): string => {
	const first_line = message
		.split('\n')
		.map((line) => line.trim())
		.find((line) => line.length > 0)
	if (!first_line) return 'New chat'
	return first_line.length <= 64 ? first_line : `${first_line.slice(0, 61)}...`
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

const summarize_notes = (notes: ReturnType<StrataDatabase['aiListNotes']>) => {
	return notes.map((note) => ({
		id: note.id,
		title: derive_note_title(note.content),
		updatedAt: note.updatedAt,
		starred: note.starred,
		archived: note.archived,
		tags: note.tags,
		excerpt: note.content.slice(0, 500),
	}))
}

const resolve_chat_model = (db: StrataDatabase): string => {
	const configured = db.getSettings().openAiModel?.trim()
	return configured || 'gpt-4o'
}

const request_openai = async (api_key: string, model: string, input: OpenAiInputItem[]): Promise<OpenAiResponsesPayload> => {
	const response = await fetch('https://api.openai.com/v1/responses', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${api_key}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model,
			input,
			instructions: system_prompt,
			tools: ai_tools,
			tool_choice: 'auto',
			store: false,
		}),
	})

	if (!response.ok) {
		const details = await response.text().catch(() => '')
		throw new Error(`OpenAI request failed (${response.status}): ${details || response.statusText}`)
	}

	return (await response.json()) as OpenAiResponsesPayload
}

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

const execute_tool_call = (db: StrataDatabase, tool_name: string, raw_args: string): ToolExecutionResult => {
	const args = parse_tool_args(raw_args)
	const normalize_tags = (value: unknown): string[] => {
		if (!Array.isArray(value)) return []
		const tags = value
			.filter((item): item is string => 'string' === typeof item)
			.map((item) => item.trim())
			.filter(Boolean)
		return [...new Set(tags)]
	}

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

	if ('create_note' === tool_name) {
		const created = db.createNote()
		const patch: Record<string, unknown> = {}
		if ('string' === typeof args.content) patch.content = args.content
		if ('boolean' === typeof args.starred) patch.starred = args.starred
		if ('boolean' === typeof args.archived) patch.archived = args.archived
		const tags = normalize_tags(args.tags)
		if (tags.length) patch.tags = tags
		const updated = Object.keys(patch).length ? db.updateNote(created.id, patch) : created
		return {
			output: JSON.stringify({ note: updated ?? created }),
			notesChanged: true,
		}
	}

	if ('update_note' === tool_name) {
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

		const updated = db.updateNote(note_id, patch)
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

const system_prompt = [
	'You are Strata AI, an assistant embedded in a local notes app.',
	'Use available tools to search notes/chats before making claims, especially for analytical requests.',
	'You may create and edit notes when the user asks. Never delete notes.',
	'If you create or edit notes, tell the user which notes changed using markdown links in the format [Note title](strata-note://<note_id>).',
	'When referencing notes, prefer note titles with strata-note links instead of raw note IDs.',
	'Thread IDs may be plain text when needed.',
].join(' ')

const map_history_to_openai = (history: AiMessage[]): OpenAiInputMessageItem[] => {
	return history.map((message) => ({
		role: message.role,
		content: message.content || '',
	}))
}

const extract_text_from_response = (response: OpenAiResponsesPayload): string => {
	if ('string' === typeof response.output_text && response.output_text.trim()) {
		return response.output_text.trim()
	}

	const output = Array.isArray(response.output) ? response.output : []
	for (const item of output) {
		if ('message' !== item.type || !Array.isArray(item.content)) continue
		const text = item.content
			.filter((content_item) => 'output_text' === content_item.type)
			.map((content_item) => content_item.text || '')
			.join('')
			.trim()
		if (text) return text
	}

	return ''
}

const escape_markdown_label = (value: string): string => value.replace(/[\\\[\]\(\)]/g, '\\$&')

const linkify_note_ids = (db: StrataDatabase, content: string): string => {
	if (!content) return ''

	const note_title_cache: Record<string, string | null> = {}

	return content.replace(note_id_pattern, (raw: string, offset: number, source: string) => {
		const prefix = source.slice(Math.max(0, offset - 14), offset).toLowerCase()
		if (prefix.endsWith('strata-note://')) return raw

		const note_id = raw.toLowerCase()
		if (!(note_id in note_title_cache)) {
			const note = db.aiGetNoteById(note_id)
			note_title_cache[note_id] = note ? derive_note_title(note.content) : null
		}

		const note_title = note_title_cache[note_id]
		if (!note_title) return raw

		return `[${escape_markdown_label(note_title)}](strata-note://${note_id})`
	})
}

const run_ai_turn = async (db: StrataDatabase, thread: AiThread): Promise<AiTurnResult> => {
	const api_key = resolve_api_key(db)
	const model = thread.model || resolve_chat_model(db)
	const history = db.listAiMessages(thread.id).slice(-40)
	const input_items: OpenAiInputItem[] = [...map_history_to_openai(history)]
	let notes_changed = false

	for (let step = 0; step < 6; step += 1) {
		const response = await request_openai(api_key, model, input_items)
		const output_items = Array.isArray(response.output) ? response.output : []
		const tool_calls = output_items.filter((item) => 'function_call' === item.type && item.call_id && item.name)

		if (!tool_calls.length) {
			const content = extract_text_from_response(response)
			if (!content) {
				return {
					content: 'I could not generate a response. Please try again.',
					notesChanged: notes_changed,
				}
			}
			return {
				content: linkify_note_ids(db, content),
				notesChanged: notes_changed,
			}
		}

		input_items.push(...output_items)

		for (const tool_call of tool_calls) {
			const tool_execution = execute_tool_call(db, tool_call.name || '', tool_call.arguments || '{}')
			if (tool_execution.notesChanged) notes_changed = true
			input_items.push({
				type: 'function_call_output',
				call_id: tool_call.call_id || '',
				output: tool_execution.output,
			})
		}
	}

	return {
		content: 'I reached the tool-call limit for this request. Please narrow the question and try again.',
		notesChanged: notes_changed,
	}
}

export const registerAiHandlers = (db: StrataDatabase, on_notes_changed?: () => void) => {
	ipcMain.handle(IPC_CHANNELS.aiThreadsList, () => {
		return db.listAiThreads()
	})

	ipcMain.handle(IPC_CHANNELS.aiThreadDelete, (_event, payload) => {
		const { threadId } = thread_id_schema.parse(payload)
		return db.deleteAiThread(threadId)
	})

	ipcMain.handle(IPC_CHANNELS.aiMessagesList, (_event, payload) => {
		const { threadId } = thread_id_schema.parse(payload)
		return db.listAiMessages(threadId)
	})

	ipcMain.handle(IPC_CHANNELS.aiSearchChats, (_event, payload) => {
		const { query, limit } = search_schema.parse(payload)
		return db.searchAiMessages(query, limit)
	})

	ipcMain.handle(IPC_CHANNELS.aiSendMessage, async (_event, payload): Promise<AiChatResponse> => {
		const { threadId, message } = send_schema.parse(payload)
		const configured_model = resolve_chat_model(db)
		let thread = threadId ? db.getAiThread(threadId) : db.createAiThread(derive_chat_title(message), configured_model)
		if (!thread) {
			throw new Error('Chat thread was not found.')
		}
		if (!thread.model) {
			thread = db.setAiThreadModel(thread.id, configured_model) || thread
		}

		db.createAiMessage(thread.id, 'user', message)
		const ai_turn = await run_ai_turn(db, thread)
		if (ai_turn.notesChanged) {
			on_notes_changed?.()
		}
		const assistant_message = db.createAiMessage(thread.id, 'assistant', ai_turn.content)
		const refreshed_thread = db.getAiThread(thread.id)
		if (!refreshed_thread) throw new Error('Chat thread was not found after response generation.')

		return {
			thread: refreshed_thread,
			message: assistant_message,
		}
	})

	ipcMain.handle(IPC_CHANNELS.aiTranscribeAudio, async (_event, payload) => {
		const { base64Audio, mimeType, prompt, language } = transcribe_schema.parse(payload)
		const api_key = resolve_api_key(db)
		const audio_buffer = Buffer.from(base64Audio, 'base64')
		if (!audio_buffer.length) {
			throw new Error('Audio payload is empty.')
		}

		const form_data = new FormData()
		const normalized_mime = mimeType.toLowerCase()
		const primary_mime = normalized_mime.split(';')[0].trim()
		const extension = primary_mime.includes('webm')
			? 'webm'
			: primary_mime.includes('mp4') || primary_mime.includes('m4a')
				? 'm4a'
				: primary_mime.includes('ogg') || primary_mime.includes('oga')
					? 'ogg'
					: primary_mime.includes('mpeg') || primary_mime.includes('mp3') || primary_mime.includes('mpga')
						? 'mp3'
						: primary_mime.includes('wav')
							? 'wav'
							: 'webm'
		form_data.append('model', 'whisper-1')
		form_data.append('language', language || 'en')
		form_data.append('prompt', prompt || 'Transcribe the speaker accurately and completely.')
		form_data.append('file', new Blob([audio_buffer], { type: primary_mime || 'audio/webm' }), `dictation.${extension}`)

		const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${api_key}`,
			},
			body: form_data,
		})

		if (!response.ok) {
			const details = await response.text().catch(() => '')
			throw new Error(`Audio transcription failed (${response.status}): ${details || response.statusText}`)
		}

		const parsed = (await response.json()) as unknown
		return {
			text: sanitize_transcription_text(extract_transcription_text(parsed)),
		}
	})
}
