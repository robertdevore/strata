export type ThemeMode = 'dark' | 'light' | 'system'

export type ViewMode = 'all' | 'starred'

export type SortMode = 'updated_desc' | 'created_desc' | 'title_asc'

export type AutoBackupFrequency = 'off' | '12h' | '24h' | '168h'

export type AiEditMode = 'read_only' | 'confirm' | 'auto_apply'

export interface Note {
	id: string
	content: string
	createdAt: string
	updatedAt: string
	starred: boolean
	archived: boolean
	tags: string[]
	deletedAt: string | null
}

export interface NotesFilter {
	query?: string
	starred?: boolean
	archived?: boolean
	tag?: string
	includeDeleted?: boolean
}

export interface Settings {
	theme: ThemeMode
	defaultView: ViewMode
	confirmDelete: boolean
	sortMode: SortMode
	openAiApiKey: string
	openAiModel: string
	autoBackupFrequency: AutoBackupFrequency
	lastAutoBackupAt: string | null
	aiEditMode: AiEditMode
}

export interface NoteUpdatePatch {
	content?: string
	starred?: boolean
	archived?: boolean
	tags?: string[]
}

export interface ListResult {
	notes: Note[]
}

export interface AiThread {
	id: string
	title: string
	model: string | null
	createdAt: string
	updatedAt: string
}

export interface AiMessage {
	id: string
	threadId: string
	role: 'user' | 'assistant' | 'system'
	content: string
	createdAt: string
}

export interface AiThreadSummary {
	thread: AiThread
	lastMessage: AiMessage | null
}

export interface AiChatResponse {
	thread: AiThread
	message: AiMessage
}

export interface AiSearchResult {
	message: AiMessage
	thread: AiThread
}

export interface NoteLink {
	id: string
	sourceNoteId: string
	targetNoteId: string | null
	rawTarget: string
	label: string | null
	heading: string | null
	linkType: 'wiki'
	createdAt: string
}

export interface AiNoteEdit {
	id: string
	noteId: string
	threadId: string | null
	messageId: string | null
	action: 'create' | 'update'
	beforeContent: string | null
	afterContent: string | null
	beforeTags: string[] | null
	afterTags: string[] | null
	model: string | null
	promptExcerpt: string | null
	createdAt: string
	revertedAt: string | null
}

export interface AiTranscriptionResult {
	text: string
}

export interface BackupResult {
	createdAt: string
	directory: string
	files: string[]
}
