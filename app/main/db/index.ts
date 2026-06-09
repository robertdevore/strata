import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { AiMessage, AiNoteEdit, AiRouteLog, AiThread, AiThreadSummary, Note, NoteLink, NoteUpdatePatch, NotesFilter, Project, Settings } from '../../shared/types'
import { DEFAULT_HOTKEYS } from '../../shared/hotkeys'
import { DEFAULT_HOME_TILES } from '../../shared/homeTiles'
import { DEFAULT_SIDEBAR_LAYOUT } from '../../shared/sidebarLayout'
import { migrations } from './migrations/index'

interface DbNoteRow {
	id: string
	content: string
	created_at: string
	updated_at: string
	starred: number
	archived: number
	tags: string
	project_id: string | null
	deleted_at: string | null
}

interface DbProjectRow {
	id: string
	name: string
	created_at: string
	updated_at: string
	sort_order: number
}

interface DbAiThreadRow {
	id: string
	title: string
	model: string | null
	created_at: string
	updated_at: string
}

interface DbAiMessageRow {
	id: string
	thread_id: string
	role: 'user' | 'assistant' | 'system'
	content: string
	created_at: string
}

interface DbNoteLinkRow {
	id: string
	source_note_id: string
	target_note_id: string | null
	raw_target: string
	label: string | null
	heading: string | null
	link_type: 'wiki'
	created_at: string
}

interface DbAiNoteEditRow {
	id: string
	note_id: string
	thread_id: string | null
	message_id: string | null
	action: 'create' | 'update'
	before_content: string | null
	after_content: string | null
	before_tags: string | null
	after_tags: string | null
	before_project_id: string | null
	after_project_id: string | null
	model: string | null
	prompt_excerpt: string | null
	created_at: string
	reverted_at: string | null
}

const DEFAULT_SETTINGS: Settings = {
	theme: 'dark',
	defaultView: 'all',
	confirmDelete: true,
	sortMode: 'updated_desc',
	openAiApiKey: '',
	openAiModel: 'gpt-4o',
	autoBackupFrequency: '24h',
	lastAutoBackupAt: null,
	aiEditMode: 'confirm',
	aiRoutingMode: 'auto',
	aiCheapProvider: 'deepseek-flash',
	aiCheapModel: 'deepseek-v4-flash',
	aiPremiumProvider: 'openai',
	aiPremiumModel: 'gpt-4o',
	aiDeepseekApiKey: '',
	aiKimiApiKey: '',
	aiOpenrouterApiKey: '',
	aiCustomApiKey: '',
	aiCustomBaseUrl: '',
	aiShowRoutingDecisions: true,
	aiEnableRouteLogs: true,
	aiCheapConfidenceThreshold: 0.85,
	aiPremiumFallbackThreshold: 0.65,
	pinnedTags: [],
	pinnedNotes: [],
	hotkeys: DEFAULT_HOTKEYS,
	aiModelCatalog: '{}',
	homeTiles: DEFAULT_HOME_TILES,
	sidebarLayout: DEFAULT_SIDEBAR_LAYOUT,
}

export class StrataDatabase {
	private db: Database.Database
	constructor(user_data_path: string) {
		const data_dir = path.join(user_data_path, 'data')
		if (!fs.existsSync(data_dir)) fs.mkdirSync(data_dir, { recursive: true })
		const db_path = path.join(data_dir, 'strata.sqlite')
		this.db = new Database(db_path)
		this.db.pragma('journal_mode = WAL')
		this.db.pragma('cache_size = -8000')
		this.db.pragma('busy_timeout = 5000')
		this.db.pragma('synchronous = NORMAL')
		this.db.pragma('temp_store = MEMORY')
		this.db.pragma('journal_size_limit = 10000000')
		this.runMigrations()
		this.ensureSettings()
	}

	close(): void {
		try {
			this.db.exec('PRAGMA optimize')
		} catch { /* ignore — db may already be in bad state */ }
		this.db.close()
	}

	private runMigrations() {
		const current_version_row = this.db.prepare('PRAGMA user_version').get() as Record<string, number>
		let current_version = current_version_row.user_version ?? 0

		for (const migration of migrations) {
			if (migration.version <= current_version) continue
			const tx = this.db.transaction(() => {
				this.db.exec(migration.upSql)
				this.db.pragma(`user_version = ${migration.version}`)
			})
			tx()
			current_version = migration.version
		}
	}

	private ensureSettings() {
		const insert = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
		for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
			insert.run(key, JSON.stringify(value))
		}
	}

	private mapNote(row: DbNoteRow): Note {
		return {
			id: row.id,
			content: row.content,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			starred: Boolean(row.starred),
			archived: Boolean(row.archived),
			tags: JSON.parse(row.tags) as string[],
			projectId: row.project_id,
			deletedAt: row.deleted_at,
		}
	}

	private mapProject(row: DbProjectRow): Project {
		return {
			id: row.id,
			name: row.name,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			sortOrder: row.sort_order,
		}
	}

	private mapAiThread(row: DbAiThreadRow): AiThread {
		return {
			id: row.id,
			title: row.title,
			model: row.model,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}
	}

	private mapAiMessage(row: DbAiMessageRow): AiMessage {
		return {
			id: row.id,
			threadId: row.thread_id,
			role: row.role,
			content: row.content,
			createdAt: row.created_at,
		}
	}

	listNotes(filters?: NotesFilter): Note[] {
		const values: unknown[] = []
		const where: string[] = []

		if (!filters?.includeDeleted) {
			where.push('deleted_at IS NULL')
		}
		if (filters?.starred) {
			where.push('starred = 1')
		}
		if (typeof filters?.archived === 'boolean') {
			where.push('archived = ?')
			values.push(filters.archived ? 1 : 0)
		}
		if (filters?.tag) {
			where.push("tags LIKE ?")
			values.push(`%"${filters.tag}"%`)
		}
		if (filters?.projectId) {
			where.push('project_id = ?')
			values.push(filters.projectId)
		}
		if (filters?.query) {
			where.push('(content LIKE ? OR tags LIKE ? OR p.name LIKE ?)')
			const wildcard = `%${filters.query}%`
			values.push(wildcard, wildcard, wildcard)
		}

		const query = `
			SELECT n.*
			FROM notes n
			LEFT JOIN projects p ON p.id = n.project_id
			${where.length ? `WHERE ${where.join(' AND ')}` : ''}
			ORDER BY n.updated_at DESC
		`
		const rows = this.db.prepare(query).all(...values) as DbNoteRow[]
		return rows.map((row) => this.mapNote(row))
	}

	getNote(id: string): Note | null {
		const row = this.db
			.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL LIMIT 1')
			.get(id) as DbNoteRow | undefined
		if (!row) return null
		return this.mapNote(row)
	}

	createNote(initial?: { content?: string; starred?: boolean; archived?: boolean; tags?: string[]; projectId?: string | null }): Note {
		const now = new Date().toISOString()
		const id = uuidv4()
		const content = initial?.content ?? ''
		const starred = Boolean(initial?.starred)
		const archived = Boolean(initial?.archived)
		const tags = Array.isArray(initial?.tags) ? initial.tags : []
		const project_id = initial?.projectId ?? null
		if (null !== project_id && !this.getProject(project_id)) {
			throw new Error('Project not found')
		}
		this.db
			.prepare(
				'INSERT INTO notes (id, content, created_at, updated_at, starred, archived, tags, project_id, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)',
			)
			.run(id, content, now, now, starred ? 1 : 0, archived ? 1 : 0, JSON.stringify(tags), project_id)
		const note = this.getNote(id)
		if (!note) throw new Error('Failed to create note')
		return note
	}

	updateNote(id: string, patch: NoteUpdatePatch): Note | null {
		const current = this.getNote(id)
		if (!current) return null

		const next_content = typeof patch.content === 'string' ? patch.content : current.content
		const next_starred = typeof patch.starred === 'boolean' ? patch.starred : current.starred
		const next_archived = typeof patch.archived === 'boolean' ? patch.archived : current.archived
		const next_tags = Array.isArray(patch.tags) ? patch.tags : current.tags
		const next_project_id = Object.prototype.hasOwnProperty.call(patch, 'projectId')
			? patch.projectId ?? null
			: current.projectId
		if (null !== next_project_id) {
			const project_exists = this.getProject(next_project_id)
			if (!project_exists) return null
		}

		// Only bump updated_at when content or tags actually change —
		// star/archive toggles and no-op flushes should not reorder the list.
		const has_real_change =
			(typeof patch.content === 'string' && patch.content !== current.content) ||
			(Array.isArray(patch.tags) && JSON.stringify(patch.tags) !== JSON.stringify(current.tags)) ||
			(Object.prototype.hasOwnProperty.call(patch, 'projectId') && patch.projectId !== current.projectId)
		const next_updated = has_real_change ? new Date().toISOString() : current.updatedAt

		this.db
			.prepare(
				'UPDATE notes SET content = ?, starred = ?, archived = ?, tags = ?, project_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
			)
			.run(next_content, next_starred ? 1 : 0, next_archived ? 1 : 0, JSON.stringify(next_tags), next_project_id, next_updated, id)

		// Rebuild wiki links when content changes
		if (typeof patch.content === 'string' && patch.content !== current.content) {
			this.rebuildLinksForContent(id, next_content)
		}

		return this.getNote(id)
	}

	/** Extract wiki links from content and rebuild the link index for a note. */
	private rebuildLinksForContent(note_id: string, content: string): void {
		const link_re = /(?<!!)\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g
		const links: Array<{ rawTarget: string; label: string | null; heading: string | null }> = []
		let match: RegExpExecArray | null
		while ((match = link_re.exec(content)) !== null) {
			const rawTarget = (match[1] ?? '').trim()
			if (!rawTarget) continue
			links.push({
				rawTarget,
				label: match[3]?.trim() ?? null,
				heading: match[2]?.trim() ?? null,
			})
		}
		this.rebuildLinks(note_id, links)
	}

	deleteNote(id: string): boolean {
		const result = this.db.prepare('UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(new Date().toISOString(), new Date().toISOString(), id)
		return result.changes > 0
	}

	restoreNote(id: string): Note | null {
		const result = this.db.prepare('UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL').run(new Date().toISOString(), id)
		if (0 === result.changes) return null
		return this.getNote(id)
	}

	archiveNote(id: string, archived: boolean): Note | null {
		return this.updateNote(id, { archived })
	}

	starNote(id: string, starred: boolean): Note | null {
		return this.updateNote(id, { starred })
	}

	listProjects(): Project[] {
		const rows = this.db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, name COLLATE NOCASE ASC').all() as DbProjectRow[]
		return rows.map((row) => this.mapProject(row))
	}

	getProject(id: string): Project | null {
		const row = this.db.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1').get(id) as DbProjectRow | undefined
		if (!row) return null
		return this.mapProject(row)
	}

	getProjectByName(name: string): Project | null {
		const normalized = name.trim()
		if (!normalized) return null
		const row = this.db.prepare('SELECT * FROM projects WHERE name = ? COLLATE NOCASE LIMIT 1').get(normalized) as DbProjectRow | undefined
		if (!row) return null
		return this.mapProject(row)
	}

	createProject(name: string): Project {
		const normalized = name.trim().replace(/\s+/g, ' ')
		if (!normalized) throw new Error('Project name is required')
		const existing = this.getProjectByName(normalized)
		if (existing) return existing
		const now = new Date().toISOString()
		const id = uuidv4()
		const next_sort_order_row = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order FROM projects').get() as { next_sort_order?: number } | undefined
		const next_sort_order = next_sort_order_row?.next_sort_order ?? 0
		this.db.prepare('INSERT INTO projects (id, name, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, ?)').run(id, normalized, now, now, next_sort_order)
		const project = this.getProject(id)
		if (!project) throw new Error('Failed to create project')
		return project
	}

	reorderProjects(project_ids: string[]): Project[] {
		const current_projects = this.listProjects()
		const project_ids_set = new Set(current_projects.map((project) => project.id))
		const ordered_ids: string[] = []
		const seen = new Set<string>()

		for (const project_id of project_ids) {
			if (!project_ids_set.has(project_id) || seen.has(project_id)) continue
			seen.add(project_id)
			ordered_ids.push(project_id)
		}

		for (const project of current_projects) {
			if (seen.has(project.id)) continue
			ordered_ids.push(project.id)
		}

		const now = new Date().toISOString()
		const transaction = this.db.transaction((ids: string[]) => {
			const statement = this.db.prepare('UPDATE projects SET sort_order = ?, updated_at = ? WHERE id = ?')
			ids.forEach((project_id, index) => {
				statement.run(index, now, project_id)
			})
		})
		transaction(ordered_ids)
		return this.listProjects()
	}

	renameProject(id: string, name: string): Project | null {
		const normalized = name.trim().replace(/\s+/g, ' ')
		if (!normalized) return null
		const current = this.getProject(id)
		if (!current) return null
		const duplicate = this.getProjectByName(normalized)
		if (duplicate && duplicate.id !== id) return null
		const result = this.db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').run(normalized, new Date().toISOString(), id)
		if (0 === result.changes) return null
		return this.getProject(id)
	}

	deleteProject(id: string): boolean {
		const transaction = this.db.transaction((project_id: string) => {
			this.db.prepare('UPDATE notes SET project_id = NULL, updated_at = ? WHERE project_id = ? AND deleted_at IS NULL').run(new Date().toISOString(), project_id)
			const deleted = this.db.prepare('DELETE FROM projects WHERE id = ?').run(project_id)
			return deleted.changes > 0
		})
		return transaction(id)
	}

	listTags(): Array<{ name: string; count: number }> {
		const notes = this.listNotes({ includeDeleted: false })
		const counts = new Map<string, number>()
		for (const note of notes) {
			for (const tag of note.tags) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1)
			}
		}
		return [...counts.entries()]
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => a.name.localeCompare(b.name))
	}

	listAiThreads(): AiThreadSummary[] {
		const rows = this.db.prepare('SELECT * FROM ai_threads ORDER BY updated_at DESC').all() as DbAiThreadRow[]
		const last_message_stmt = this.db.prepare('SELECT * FROM ai_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1')
		return rows.map((thread_row) => {
			const last_message_row = last_message_stmt.get(thread_row.id) as DbAiMessageRow | undefined
			return {
				thread: this.mapAiThread(thread_row),
				lastMessage: last_message_row ? this.mapAiMessage(last_message_row) : null,
			}
		})
	}

	getAiThread(id: string): AiThread | null {
		const row = this.db.prepare('SELECT * FROM ai_threads WHERE id = ? LIMIT 1').get(id) as DbAiThreadRow | undefined
		if (!row) return null
		return this.mapAiThread(row)
	}

	createAiThread(title: string, model: string): AiThread {
		const now = new Date().toISOString()
		const id = uuidv4()
		this.db.prepare('INSERT INTO ai_threads (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, title, model, now, now)
		const created = this.getAiThread(id)
		if (!created) throw new Error('Failed to create AI thread')
		return created
	}

	setAiThreadModel(id: string, model: string): AiThread | null {
		const result = this.db.prepare('UPDATE ai_threads SET model = ?, updated_at = ? WHERE id = ?').run(model, new Date().toISOString(), id)
		if (0 === result.changes) return null
		return this.getAiThread(id)
	}

	setAiThreadTitle(id: string, title: string): AiThread | null {
		const result = this.db.prepare('UPDATE ai_threads SET title = ?, updated_at = ? WHERE id = ?').run(title, new Date().toISOString(), id)
		if (0 === result.changes) return null
		return this.getAiThread(id)
	}

	deleteAiThread(id: string): boolean {
		const transaction = this.db.transaction((thread_id: string) => {
			this.db.prepare('DELETE FROM ai_messages WHERE thread_id = ?').run(thread_id)
			const deleted_thread = this.db.prepare('DELETE FROM ai_threads WHERE id = ?').run(thread_id)
			return deleted_thread.changes > 0
		})

		return transaction(id)
	}

	touchAiThread(id: string): void {
		this.db.prepare('UPDATE ai_threads SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id)
	}

	listAiMessages(thread_id: string): AiMessage[] {
		const rows = this.db.prepare('SELECT * FROM ai_messages WHERE thread_id = ? ORDER BY created_at ASC').all(thread_id) as DbAiMessageRow[]
		return rows.map((row) => this.mapAiMessage(row))
	}

	createAiMessage(thread_id: string, role: 'user' | 'assistant' | 'system', content: string): AiMessage {
		const now = new Date().toISOString()
		const id = uuidv4()
		this.db.prepare('INSERT INTO ai_messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(id, thread_id, role, content, now)
		this.touchAiThread(thread_id)
		const row = this.db.prepare('SELECT * FROM ai_messages WHERE id = ? LIMIT 1').get(id) as DbAiMessageRow | undefined
		if (!row) throw new Error('Failed to create AI message')
		return this.mapAiMessage(row)
	}

	searchAiMessages(query: string, limit = 20): Array<{ thread: AiThread; message: AiMessage }> {
		const rows = this.db
			.prepare(
				`SELECT m.id as message_id, m.thread_id, m.role, m.content, m.created_at,
					t.id as thread_id_2, t.title, t.model as thread_model, t.created_at as thread_created_at, t.updated_at as thread_updated_at
				 FROM ai_messages m
				 JOIN ai_threads t ON t.id = m.thread_id
				 WHERE m.content LIKE ?
				 ORDER BY m.created_at DESC
				 LIMIT ?`,
			)
			.all(`%${query}%`, Math.max(1, Math.min(100, limit))) as Array<{
				message_id: string
				thread_id: string
				role: 'user' | 'assistant' | 'system'
				content: string
				created_at: string
				thread_id_2: string
				title: string
				thread_model: string | null
				thread_created_at: string
				thread_updated_at: string
			}>

		return rows.map((row) => ({
			thread: {
				id: row.thread_id_2,
				title: row.title,
				model: row.thread_model,
				createdAt: row.thread_created_at,
				updatedAt: row.thread_updated_at,
			},
			message: {
				id: row.message_id,
				threadId: row.thread_id,
				role: row.role,
				content: row.content,
				createdAt: row.created_at,
			},
		}))
	}

	aiListNotes(limit = 50, include_archived = true): Note[] {
		const rows = this.db
			.prepare(
				`SELECT * FROM notes
				 WHERE deleted_at IS NULL
				 ${include_archived ? '' : 'AND archived = 0'}
				 ORDER BY updated_at DESC
				 LIMIT ?`,
			)
			.all(Math.max(1, Math.min(200, limit))) as DbNoteRow[]
		return rows.map((row) => this.mapNote(row))
	}

	aiSearchNotes(query: string, limit = 20): Note[] {
		const wildcard = `%${query}%`
		const rows = this.db
			.prepare(
				`SELECT n.*
				 FROM notes n
				 LEFT JOIN projects p ON p.id = n.project_id
				 WHERE deleted_at IS NULL
				 AND (content LIKE ? OR tags LIKE ? OR p.name LIKE ?)
				 ORDER BY n.updated_at DESC
				 LIMIT ?`,
			)
			.all(wildcard, wildcard, wildcard, Math.max(1, Math.min(200, limit))) as DbNoteRow[]
		return rows.map((row) => this.mapNote(row))
	}

	aiGetNoteById(id: string, include_deleted = false): Note | null {
		const row = this.db
			.prepare(`SELECT * FROM notes WHERE id = ? ${include_deleted ? '' : 'AND deleted_at IS NULL'} LIMIT 1`)
			.get(id) as DbNoteRow | undefined
		if (!row) return null
		return this.mapNote(row)
	}

	/** Record an AI edit in the history table. */
	recordAiEdit(edit: {
		noteId: string
		threadId?: string | null
		messageId?: string | null
		action: 'create' | 'update'
		beforeContent?: string | null
		afterContent?: string | null
		beforeTags?: string[] | null
		afterTags?: string[] | null
		beforeProjectId?: string | null
		afterProjectId?: string | null
		model?: string | null
		promptExcerpt?: string | null
	}): string {
		const id = uuidv4()
		const now = new Date().toISOString()
		this.db.prepare(
			`INSERT INTO ai_note_edits (id, note_id, thread_id, message_id, action, before_content, after_content, before_tags, after_tags, before_project_id, after_project_id, model, prompt_excerpt, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			id,
			edit.noteId,
			edit.threadId ?? null,
			edit.messageId ?? null,
			edit.action,
			edit.beforeContent ?? null,
			edit.afterContent ?? null,
			edit.beforeTags ? JSON.stringify(edit.beforeTags) : null,
			edit.afterTags ? JSON.stringify(edit.afterTags) : null,
			edit.beforeProjectId ?? null,
			edit.afterProjectId ?? null,
			edit.model ?? null,
			edit.promptExcerpt ?? null,
			now,
		)
		return id
	}

	/** Record a routing decision log entry. Best-effort — failures are silent. */
	recordRouteLog(log: {
		threadId?: string | null
		userMessage: string
		intent: string
		route: string
		providerId: string
		model: string
		confidence?: number | null
		risk?: string | null
		requiresConfirmation?: boolean
		reason?: string | null
		fallbackUsed?: boolean
		fallbackReason?: string | null
		inputTokens?: number | null
		outputTokens?: number | null
	}): string {
		const id = uuidv4()
		const now = new Date().toISOString()
		this.db.prepare(
			`INSERT INTO ai_route_logs (id, thread_id, user_message, intent, route, provider_id, model, confidence, risk, requires_confirmation, reason, fallback_used, fallback_reason, input_tokens, output_tokens, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			id,
			log.threadId ?? null,
			log.userMessage,
			log.intent,
			log.route,
			log.providerId,
			log.model,
			log.confidence ?? null,
			log.risk ?? null,
			log.requiresConfirmation ? 1 : 0,
			log.reason ?? null,
			log.fallbackUsed ? 1 : 0,
			log.fallbackReason ?? null,
			log.inputTokens ?? null,
			log.outputTokens ?? null,
			now,
		)
		return id
	}

	/** Get the most recent AI edit for a note (non-reverted). */
	getLatestAiEdit(note_id: string): AiNoteEdit | null {
		const row = this.db
			.prepare('SELECT * FROM ai_note_edits WHERE note_id = ? AND reverted_at IS NULL ORDER BY created_at DESC LIMIT 1')
			.get(note_id) as DbAiNoteEditRow | undefined
		if (!row) return null
		return this.mapAiNoteEdit(row)
	}

	/** Mark an AI edit as reverted and restore the previous content/tags. */
	revertAiEdit(edit_id: string): boolean {
		const edit = this.db.prepare('SELECT * FROM ai_note_edits WHERE id = ? AND reverted_at IS NULL').get(edit_id) as DbAiNoteEditRow | undefined
		if (!edit) return false

		const note = this.getNote(edit.note_id)
		if (!note) return false

		const now = new Date().toISOString()

		// Restore previous content and tags
		if ('update' === edit.action && edit.before_content !== null) {
			const restore_patch: NoteUpdatePatch = {
				content: edit.before_content,
				tags: edit.before_tags ? (JSON.parse(edit.before_tags) as string[]) : undefined,
			}
			if (undefined !== edit.before_project_id) {
				restore_patch.projectId = edit.before_project_id
			}
			this.updateNote(edit.note_id, restore_patch)
		} else if ('create' === edit.action) {
			// Soft-delete the created note
			this.deleteNote(edit.note_id)
		}

		// Mark edit as reverted
		this.db.prepare('UPDATE ai_note_edits SET reverted_at = ? WHERE id = ?').run(now, edit_id)
		return true
	}

	/** List recent AI edits for a note. */
	listAiEdits(note_id: string, limit = 20): AiNoteEdit[] {
		const rows = this.db
			.prepare('SELECT * FROM ai_note_edits WHERE note_id = ? ORDER BY created_at DESC LIMIT ?')
			.all(note_id, limit) as DbAiNoteEditRow[]
		return rows.map((row) => this.mapAiNoteEdit(row))
	}

	/** List recent route logs. */
	listAiRouteLogs(limit = 100): AiRouteLog[] {
		const rows = this.db
			.prepare('SELECT * FROM ai_route_logs ORDER BY created_at DESC LIMIT ?')
			.all(limit) as Array<{
				id: string
				thread_id: string | null
				user_message: string
				intent: string
				route: string
				provider_id: string
				model: string
				confidence: number | null
				risk: string | null
				requires_confirmation: number
				reason: string | null
				fallback_used: number
				fallback_reason: string | null
				input_tokens: number | null
				output_tokens: number | null
				created_at: string
			}>
		return rows.map((row) => ({
			id: row.id,
			threadId: row.thread_id,
			userMessage: row.user_message,
			intent: row.intent,
			route: row.route,
			providerId: row.provider_id,
			model: row.model,
			confidence: row.confidence,
			risk: row.risk,
			requiresConfirmation: Boolean(row.requires_confirmation),
			reason: row.reason,
			fallbackUsed: Boolean(row.fallback_used),
			fallbackReason: row.fallback_reason,
			inputTokens: row.input_tokens,
			outputTokens: row.output_tokens,
			createdAt: row.created_at,
		}))
	}

	/** List recent route logs for a specific thread. */
	listAiRouteLogsForThread(thread_id: string, limit = 500): AiRouteLog[] {
		const rows = this.db
			.prepare('SELECT * FROM ai_route_logs WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?')
			.all(thread_id, Math.max(1, Math.min(5000, limit))) as Array<{
				id: string
				thread_id: string | null
				user_message: string
				intent: string
				route: string
				provider_id: string
				model: string
				confidence: number | null
				risk: string | null
				requires_confirmation: number
				reason: string | null
				fallback_used: number
				fallback_reason: string | null
				input_tokens: number | null
				output_tokens: number | null
				created_at: string
			}>

		return rows.map((row) => ({
			id: row.id,
			threadId: row.thread_id,
			userMessage: row.user_message,
			intent: row.intent,
			route: row.route,
			providerId: row.provider_id,
			model: row.model,
			confidence: row.confidence,
			risk: row.risk,
			requiresConfirmation: Boolean(row.requires_confirmation),
			reason: row.reason,
			fallbackUsed: Boolean(row.fallback_used),
			fallbackReason: row.fallback_reason,
			inputTokens: row.input_tokens,
			outputTokens: row.output_tokens,
			createdAt: row.created_at,
		}))
	}

	private mapAiNoteEdit(row: DbAiNoteEditRow): AiNoteEdit {
		return {
			id: row.id,
			noteId: row.note_id,
			threadId: row.thread_id,
			messageId: row.message_id,
			action: row.action,
			beforeContent: row.before_content,
			afterContent: row.after_content,
			beforeTags: row.before_tags ? (JSON.parse(row.before_tags) as string[]) : null,
			afterTags: row.after_tags ? (JSON.parse(row.after_tags) as string[]) : null,
			beforeProjectId: row.before_project_id,
			afterProjectId: row.after_project_id,
			model: row.model,
			promptExcerpt: row.prompt_excerpt,
			createdAt: row.created_at,
			revertedAt: row.reverted_at,
		}
	}

	getSettings(): Settings {
		const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
		const merged = { ...DEFAULT_SETTINGS }
		for (const row of rows) {
			const parsed = JSON.parse(row.value)
			if (row.key in merged) {
				;(merged as Record<string, unknown>)[row.key] = parsed
			}
		}
		return merged
	}

	private mapNoteLink(row: DbNoteLinkRow): NoteLink {
		return {
			id: row.id,
			sourceNoteId: row.source_note_id,
			targetNoteId: row.target_note_id,
			rawTarget: row.raw_target,
			label: row.label,
			heading: row.heading,
			linkType: row.link_type,
			createdAt: row.created_at,
		}
	}

	/** Rebuild all wiki links for a note. Call after content changes. */
	rebuildLinks(source_note_id: string, links: Array<{ rawTarget: string; label: string | null; heading: string | null }>): void {
		const tx = this.db.transaction(() => {
			// Remove old links for this source
			this.db.prepare('DELETE FROM note_links WHERE source_note_id = ?').run(source_note_id)

			const insert = this.db.prepare(
				'INSERT INTO note_links (id, source_note_id, target_note_id, raw_target, label, heading, link_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
			)
			const now = new Date().toISOString()

			for (const link of links) {
				const target_note = this.resolveLinkTarget(link.rawTarget)
				insert.run(
					uuidv4(),
					source_note_id,
					target_note?.id ?? null,
					link.rawTarget,
					link.label,
					link.heading,
					'wiki',
					now,
				)
			}
		})
		tx()
	}

	/** Find the best-matching note for a wiki link target. Returns most-recently-updated match. */
	private resolveLinkTarget(raw_target: string): Note | null {
		const normalized = raw_target.trim().toLowerCase().replace(/\s+/g, ' ')
		// Find notes whose title (derived from first line) matches the target
		const all_notes = this.listNotes({ includeDeleted: false })
		const matches = all_notes.filter((note) => {
			const title = this.deriveTitleFromContent(note.content)
			return title.trim().toLowerCase().replace(/\s+/g, ' ') === normalized
		})
		if (matches.length === 0) return null
		// Return most recently updated
		matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		return matches[0]
	}

	private deriveTitleFromContent(content: string): string {
		const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
		if (lines.length === 0) return 'Untitled'
		const heading = lines.find((line) => line.startsWith('# '))
		if (heading) {
			const normalized = heading.replace(/^#\s*/, '').trim()
			return normalized || 'Untitled'
		}
		return lines[0].slice(0, 80)
	}

	/** Get all notes that link TO the given note (backlinks). */
	getBacklinks(target_note_id: string): Array<{ link: NoteLink; source: Note }> {
		const rows = this.db
			.prepare('SELECT * FROM note_links WHERE target_note_id = ? ORDER BY created_at DESC')
			.all(target_note_id) as DbNoteLinkRow[]

		return rows
			.map((row) => {
				const source = this.getNote(row.source_note_id)
				if (!source) return null
				return { link: this.mapNoteLink(row), source }
			})
			.filter((entry): entry is { link: NoteLink; source: Note } => entry !== null)
	}

	/** Get the excerpt around a wiki link in a source note's content (for backlink previews). */
	/** Get the excerpt around a wiki link in a source note's content (for backlink previews). */
	getLinkExcerpt(source_note_id: string, raw_target: string, context_chars = 60): string | null {
		const note = this.getNote(source_note_id)
		if (!note) return null
		const content = note.content
		const pattern = new RegExp(`\\[\\[${raw_target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:#[^\\]|]+)?(?:\\|[^\\]]+)?\\]\\]`, 'i')
		const match = pattern.exec(content)
		if (!match) return null
		const start = Math.max(0, match.index - context_chars)
		const end = Math.min(content.length, match.index + match[0].length + context_chars)
		let excerpt = content.slice(start, end)
		if (start > 0) excerpt = '…' + excerpt
		if (end < content.length) excerpt = excerpt + '…'
		return excerpt
	}

	/** Get all note links as a flat index (for related-note computation). */
	getAllLinks(): Array<{ sourceNoteId: string; targetNoteId: string | null; rawTarget: string }> {
		const rows = this.db.prepare('SELECT source_note_id, target_note_id, raw_target FROM note_links ORDER BY created_at DESC').all() as Array<{ source_note_id: string; target_note_id: string | null; raw_target: string }>
		return rows.map((r) => ({ sourceNoteId: r.source_note_id, targetNoteId: r.target_note_id, rawTarget: r.raw_target }))
	}

	setSettings(patch: Partial<Settings>): Settings {
		const now = this.getSettings()
		const next = { ...now, ...patch }
		const upsert = this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
		for (const [key, value] of Object.entries(next)) {
			upsert.run(key, JSON.stringify(value))
		}
		return next
	}
}
