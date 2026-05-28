import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { AiChatResponse } from '../../shared/types'
import type { StrataDatabase } from '../db/index'
import { run_ai_turn, derive_chat_title, resolve_ai_settings } from '../ai/aiRunner'

const thread_id_schema = z.object({ threadId: z.string().uuid() })
const rename_thread_schema = z.object({ threadId: z.string().uuid(), title: z.string().trim().min(1).max(120) })
const search_schema = z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(100).optional() })
const open_note_context_schema = z.object({
	id: z.string().uuid(),
	title: z.string().trim().min(1).max(160),
	content: z.string().max(12000),
})
const send_schema = z.object({
	threadId: z.string().uuid().optional(),
	message: z.string().trim().min(1).max(12000),
	openNotes: z.array(open_note_context_schema).max(12).optional(),
})
const route_logs_schema = z.object({ threadId: z.string().uuid().optional(), limit: z.number().int().min(1).max(5000).optional() }).optional()
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

const build_open_notes_context = (open_notes: Array<{ id: string; title: string; content: string }> | undefined): string => {
	if (!open_notes || 0 === open_notes.length) return ''

	const sections = open_notes.map((note, index) => {
		const compact_content = note.content.replace(/\s+/g, ' ').trim().slice(0, 2600)
		return [
			`Open tab ${index + 1}:`,
			`- Note ID: ${note.id}`,
			`- Title: ${note.title}`,
			`- Content excerpt: ${compact_content || '(empty)'}`,
		].join('\n')
	})

	return [
		'The user currently has these notes open in tabs. Use them as immediate context before broader note search:',
		sections.join('\n\n'),
	].join('\n\n')
}

const resolve_chat_model = (db: StrataDatabase): string => {
	const ai_settings = resolve_ai_settings(db)
	const mode = ai_settings.aiRoutingMode
	if ('cheap_only' === mode) return ai_settings.aiCheapModel || 'deepseek-v4-flash'
	return ai_settings.aiPremiumModel || ai_settings.openAiModel || 'gpt-4o'
}

export const registerAiHandlers = (db: StrataDatabase, on_notes_changed?: () => void) => {
	ipcMain.handle(IPC_CHANNELS.aiThreadsList, () => {
		return db.listAiThreads()
	})

	ipcMain.handle(IPC_CHANNELS.aiThreadDelete, (_event, payload) => {
		const { threadId } = thread_id_schema.parse(payload)
		return db.deleteAiThread(threadId)
	})

	ipcMain.handle(IPC_CHANNELS.aiThreadRename, (_event, payload) => {
		const { threadId, title } = rename_thread_schema.parse(payload)
		return Boolean(db.setAiThreadTitle(threadId, title))
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
		const { threadId, message, openNotes } = send_schema.parse(payload)
		const configured_model = resolve_chat_model(db)
		let thread = threadId ? db.getAiThread(threadId) : db.createAiThread(derive_chat_title(message), configured_model)
		if (!thread) {
			throw new Error('Chat thread was not found.')
		}
		if (!thread.model) {
			thread = db.setAiThreadModel(thread.id, configured_model) || thread
		}

		db.createAiMessage(thread.id, 'user', message)
		const ai_turn = await run_ai_turn(db, thread, {
			openNotesContext: build_open_notes_context(openNotes),
		})
		if (ai_turn.routeLog?.model) {
			thread = db.setAiThreadModel(thread.id, ai_turn.routeLog.model) || thread
		}
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
		const ai_settings = resolve_ai_settings(db)
		const api_key = ai_settings.openAiApiKey || process.env.STRATA_OPENAI_API_KEY?.trim()
		if (!api_key) {
			throw new Error('AI is not configured. Set STRATA_OPENAI_API_KEY or add an OpenAI API Key in Settings.')
		}
		const audio_buffer = Buffer.from(base64Audio, 'base64')
		if (!audio_buffer.length) {
			throw new Error('Audio payload is empty.')
		}

		const form_data = new FormData()
		form_data.append('file', new Blob([audio_buffer], { type: mimeType }), `audio.${mimeType.split('/')[1] || 'wav'}`)
		form_data.append('model', 'whisper-1')
		if (prompt) form_data.append('prompt', prompt)
		if (language) form_data.append('language', language)

		const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
			method: 'POST',
			headers: { Authorization: `Bearer ${api_key}` },
			body: form_data,
		})

		if (!response.ok) {
			const details = await response.text().catch(() => '')
			throw new Error(`Transcription request failed (${response.status}): ${details || response.statusText}`)
		}

		const raw = await response.json()
		const text = sanitize_transcription_text(extract_transcription_text(raw))
		if (!text) {
			throw new Error('Transcription could not be extracted from the response.')
		}

		return { text }
	})

	// Route logs listing
	ipcMain.handle(IPC_CHANNELS.aiRouteLogsList, (_event, payload) => {
		const parsed = route_logs_schema.parse(payload)
		if (parsed?.threadId) {
			return db.listAiRouteLogsForThread(parsed.threadId, parsed.limit ?? 500)
		}
		return db.listAiRouteLogs(parsed?.limit ?? 100)
	})

	// AI edits list (unchanged)
	ipcMain.handle(IPC_CHANNELS.aiEditsList, (_event, payload) => {
		const { noteId } = z.object({ noteId: z.string().uuid() }).parse(payload)
		return db.listAiEdits(noteId)
	})

	// AI edits revert (unchanged)
	ipcMain.handle(IPC_CHANNELS.aiEditsRevert, (_event, payload) => {
		const { editId } = z.object({ editId: z.string().uuid() }).parse(payload)
		return db.revertAiEdit(editId)
	})
}
