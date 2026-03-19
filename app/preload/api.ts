import type { AiChatResponse, AiMessage, AiSearchResult, AiThreadSummary, AiTranscriptionResult, BackupResult, Note, NoteUpdatePatch, NotesFilter, Settings } from '../shared/types'

export interface StrataApi {
	notes: {
		list: (filters?: NotesFilter) => Promise<Note[]>
		get: (id: string) => Promise<Note | null>
		create: () => Promise<Note>
		update: (id: string, patch: NoteUpdatePatch) => Promise<Note | null>
		delete: (id: string) => Promise<boolean>
		restore: (id: string) => Promise<Note | null>
		archive: (id: string, archived: boolean) => Promise<Note | null>
		star: (id: string, starred: boolean) => Promise<Note | null>
	}
	tags: {
		list: () => Promise<Array<{ name: string; count: number }>>
	}
	settings: {
		get: () => Promise<Settings>
		set: (patch: Partial<Settings>) => Promise<Settings>
	}
	exports: {
		pdf: (payload: { html: string }) => Promise<Uint8Array>
		print: (payload: { html: string }) => Promise<boolean>
	}
	backups: {
		createNow: () => Promise<BackupResult>
		openFolder: () => Promise<boolean>
	}
	ai: {
		listThreads: () => Promise<AiThreadSummary[]>
		deleteThread: (thread_id: string) => Promise<boolean>
		listMessages: (thread_id: string) => Promise<AiMessage[]>
		sendMessage: (payload: { threadId?: string; message: string }) => Promise<AiChatResponse>
		searchChats: (query: string) => Promise<AiSearchResult[]>
		transcribeAudio: (payload: { base64Audio: string; mimeType: string; prompt?: string; language?: string }) => Promise<AiTranscriptionResult>
	}
	onCommand: (listener: (command: string) => void) => () => void
	onNotesChanged: (listener: () => void) => () => void
}
