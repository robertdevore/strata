import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { AiMessage, AiThread, AiThreadSummary, Note, NoteUpdatePatch, NotesFilter, Settings } from '../../shared/types'
import { migrations } from './migrations/index'

interface DbNoteRow {
	id: string
	content: string
	created_at: string
	updated_at: string
	starred: number
	archived: number
	tags: string
	deleted_at: string | null
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

const DEFAULT_SETTINGS: Settings = {
	theme: 'dark',
	defaultView: 'all',
	confirmDelete: true,
	sortMode: 'updated_desc',
	openAiApiKey: '',
	openAiModel: 'gpt-4o',
	autoBackupFrequency: '24h',
	lastAutoBackupAt: null,
}

export class StrataDatabase {
	private db: Database.Database

	constructor(user_data_path: string) {
		const data_dir = path.join(user_data_path, 'data')
		if (!fs.existsSync(data_dir)) fs.mkdirSync(data_dir, { recursive: true })
		const db_path = path.join(data_dir, 'strata.sqlite')
		this.db = new Database(db_path)
		this.db.pragma('journal_mode = WAL')
		this.runMigrations()
		this.ensureSettings()
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
			deletedAt: row.deleted_at,
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
		if (filters?.query) {
			where.push('(content LIKE ? OR tags LIKE ?)')
			const wildcard = `%${filters.query}%`
			values.push(wildcard, wildcard)
		}

		const query = `
			SELECT * FROM notes
			${where.length ? `WHERE ${where.join(' AND ')}` : ''}
			ORDER BY updated_at DESC
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

	createNote(): Note {
		const now = new Date().toISOString()
		const id = uuidv4()
		this.db
			.prepare(
				'INSERT INTO notes (id, content, created_at, updated_at, starred, archived, tags, deleted_at) VALUES (?, ?, ?, ?, 0, 0, ?, NULL)',
			)
			.run(id, '# Untitled\n\n', now, now, JSON.stringify([]))
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
		const next_updated = new Date().toISOString()

		this.db
			.prepare(
				'UPDATE notes SET content = ?, starred = ?, archived = ?, tags = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
			)
			.run(next_content, next_starred ? 1 : 0, next_archived ? 1 : 0, JSON.stringify(next_tags), next_updated, id)

		return this.getNote(id)
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
				`SELECT * FROM notes
				 WHERE deleted_at IS NULL
				 AND (content LIKE ? OR tags LIKE ?)
				 ORDER BY updated_at DESC
				 LIMIT ?`,
			)
			.all(wildcard, wildcard, Math.max(1, Math.min(200, limit))) as DbNoteRow[]
		return rows.map((row) => this.mapNote(row))
	}

	aiGetNoteById(id: string, include_deleted = false): Note | null {
		const row = this.db
			.prepare(`SELECT * FROM notes WHERE id = ? ${include_deleted ? '' : 'AND deleted_at IS NULL'} LIMIT 1`)
			.get(id) as DbNoteRow | undefined
		if (!row) return null
		return this.mapNote(row)
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
