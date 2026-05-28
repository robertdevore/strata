import type { AiChatResponse, AiMessage, AiNoteEdit, AiOpenNoteContext, AiRouteLog, AiSearchResult, AiThreadSummary, AiTranscriptionResult, BackupResult, Note, NoteLink, NoteUpdatePatch, NotesFilter, Settings } from '../shared/types'

export interface BackupListing {
	name: string
	createdAt: string
	sizeBytes: number
}

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
		listRecent: () => Promise<BackupListing[]>
	}
	ai: {
		listThreads: () => Promise<AiThreadSummary[]>
		deleteThread: (thread_id: string) => Promise<boolean>
		renameThread: (thread_id: string, title: string) => Promise<boolean>
		setThreadModel: (thread_id: string, model: string) => Promise<boolean>
		listMessages: (thread_id: string) => Promise<AiMessage[]>
		sendMessage: (payload: { threadId?: string; message: string; openNotes?: AiOpenNoteContext[] }) => Promise<AiChatResponse>
		searchChats: (query: string) => Promise<AiSearchResult[]>
		transcribeAudio: (payload: { base64Audio: string; mimeType: string; prompt?: string; language?: string }) => Promise<AiTranscriptionResult>
		listEdits: (noteId: string) => Promise<AiNoteEdit[]>
		revertEdit: (editId: string) => Promise<boolean>
		listRouteLogs: (thread_id?: string) => Promise<AiRouteLog[]>
		modelCatalog: () => Promise<Array<{ providerId: string; providerLabel: string; model: string }>>
	}
	links: {
		backlinks: (note_id: string) => Promise<Array<{ link: NoteLink; source: Note }>>
		resolveTarget: (raw_target: string) => Promise<Note | null>
		createMissingNote: (title: string) => Promise<Note | null>
		relatedNotes: (note_id: string) => Promise<Array<{ note: Note; reason: string; score: number }>>
	}
	publish: {
		selectFolder: () => Promise<string | null>
		htmlFile: (payload: { destination: string; title: string; html: string }) => Promise<{ success: boolean; path?: string; error?: string }>
	}
	shell: {
		run: (payload: { command: string; cwd?: string }) => Promise<{ success: boolean; stdout: string; stderr: string }>
	}
	onCommand: (listener: (command: string) => void) => () => void
	onNotesChanged: (listener: () => void) => () => void
}
