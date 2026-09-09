import { LibraryAccess } from './libraryAccess'
import { sanitizeBackup } from './sanitizeBackup'
import { DomainError } from '../../shared/errors'
import type { NoteSummary, NoteRevision } from '../../shared/types'
import { SECRET_KEYS, SECRET_PRESENT, type SecretStore } from '../security/secretStore'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { v4 as uuidv4 } from 'uuid'
import type {
  AiMessage,
  AiNoteEdit,
  AiRouteLog,
  AiThread,
  AiThreadSummary,
  Note,
  NoteLink,
  NoteUpdatePatch,
  NotesFilter,
  Project,
  ProjectSummary,
  Settings,
} from '../../shared/types'
import { DEFAULT_HOTKEYS } from '../../shared/hotkeys'
import { DEFAULT_HOME_TILES } from '../../shared/homeTiles'
import { DEFAULT_SIDEBAR_LAYOUT } from '../../shared/sidebarLayout'
import { deriveNoteTitle } from '../../shared/noteTitle'
import { migrations } from './migrations/index'

const require = createRequire(import.meta.url)
const packaged_database_directory = process.resourcesPath
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'better-sqlite3')
  : ''
const databaseEntry = require.resolve(
  packaged_database_directory && fs.existsSync(path.join(packaged_database_directory, 'package.json'))
    ? packaged_database_directory
    : 'better-sqlite3',
)
const Database = require(databaseEntry) as typeof import('better-sqlite3')

interface DbNoteRow {
  title: string
  normalized_title: string
  revision: number
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

const NOTE_SUMMARY_CONTENT_LIMIT = 280

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
  autoBackupKeepCount: 0,
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
  aiCustomCapabilities: { tools: true, systemMessages: true, temperature: true },
  aiShowRoutingDecisions: true,
  aiEnableRouteLogs: false,
  aiRouteLogRetentionDays: 30,
  aiCheapConfidenceThreshold: 0.85,
  aiPremiumFallbackThreshold: 0.65,
  pinnedTags: [],
  pinnedNotes: [],
  hotkeys: DEFAULT_HOTKEYS,
  aiModelCatalog: '{}',
  homeTiles: DEFAULT_HOME_TILES,
  sidebarLayout: DEFAULT_SIDEBAR_LAYOUT,
}

export const createLibraryAccess = (userDataPath: string): LibraryAccess => {
  const dataDirectory = path.join(userDataPath, 'data')
  fs.mkdirSync(dataDirectory, { recursive: true })
  return new LibraryAccess(path.join(dataDirectory, '.strata-access.sqlite'), Database)
}

export class StrataDatabase {
  private db: import('better-sqlite3').Database
  private secretStore?: SecretStore
  private access: LibraryAccess

  constructor(user_data_path: string, access?: LibraryAccess) {
    const data_dir = path.join(user_data_path, 'data')
    if (!fs.existsSync(data_dir)) fs.mkdirSync(data_dir, { recursive: true })
    const db_path = path.join(data_dir, 'strata.sqlite')
    this.access = access ?? createLibraryAccess(user_data_path)
    try {
      this.db = new Database(db_path)
    } catch (error) {
      if (!access) this.access.close()
      throw error
    }
    try {
      this.db.function('strata_content_hash', { deterministic: true }, (content: string) =>
        createHash('sha256').update(content.replace(/\r\n/g, '\n').trim()).digest('hex'),
      )
      this.db.function('strata_title', { deterministic: true }, deriveNoteTitle)
      this.db.function('strata_normalize', { deterministic: true }, (value: string) =>
        this.normalizeTitle(value),
      )
      this.db.pragma('foreign_keys = ON')
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('cache_size = -8000')
      this.db.pragma('busy_timeout = 5000')
      this.db.pragma('synchronous = NORMAL')
      this.db.pragma('temp_store = MEMORY')
      this.db.pragma('journal_size_limit = 10000000')
      this.runMigrations()
      this.ensureSettings()
      this.sanitizeRouteLogs()
      this.pruneRouteLogs()
    } catch (error) {
      this.db.close()
      if (!access) this.access.close()
      throw error
    }
  }

  private mutationSource = 'system'
  transaction<T>(operation: () => T, source = this.mutationSource): T {
    const previous = this.mutationSource
    this.mutationSource = source
    try {
      return this.db.transaction(operation)()
    } finally {
      this.mutationSource = previous
    }
  }

  executeOperation<T>(
    apply: () => T,
    options: { source?: string; key?: string; fingerprint: string; dryRun?: boolean },
  ): T {
    let result: T
    const rollback = Symbol('dry-run')
    try {
      return this.transaction(() => {
        if (options.key) {
          if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(options.key))
            throw new DomainError('VALIDATION_ERROR', 'Invalid idempotency key')
          this.db.prepare("DELETE FROM operation_receipts WHERE created_at < datetime('now','-7 days')").run()
          const receipt = this.db
            .prepare('SELECT fingerprint,result FROM operation_receipts WHERE key=?')
            .get(options.key) as { fingerprint: string; result: string } | undefined
          if (receipt) {
            if (receipt.fingerprint !== options.fingerprint)
              throw new DomainError('IDEMPOTENCY_CONFLICT', 'Key already used for a different operation')
            return JSON.parse(receipt.result) as T
          }
        }
        result = apply()
        if (options.dryRun) throw rollback
        if (options.key)
          this.db
            .prepare('INSERT INTO operation_receipts VALUES (?,?,?,?)')
            .run(options.key, options.fingerprint, JSON.stringify(result), new Date().toISOString())
        return result
      }, options.source ?? 'system')
    } catch (error) {
      if (error === rollback) return result!
      throw error
    }
  }

  createProposal(payload: unknown): string {
    const id = uuidv4()
    this.db
      .prepare('INSERT INTO mutation_proposals(id,payload,created_at) VALUES(?,?,?)')
      .run(id, JSON.stringify(payload), new Date().toISOString())
    return id
  }
  listProposals(threadId?: string): Array<{ id: string; payload: unknown; createdAt: string }> {
    return (
      this.db
        .prepare(
          `SELECT * FROM mutation_proposals WHERE status='pending'
           AND (? IS NULL OR json_extract(payload, '$.actor.threadId') = ?)
           ORDER BY created_at, id LIMIT 50`,
        )
        .all(threadId ?? null, threadId ?? null) as Array<{ id: string; payload: string; created_at: string }>
    ).map((row) => ({ id: row.id, payload: JSON.parse(row.payload), createdAt: row.created_at }))
  }
  resolveProposal<T>(id: string, approved: boolean, apply: (payload: unknown) => T): T | null {
    return this.transaction(() => {
      const row = this.db
        .prepare("SELECT payload FROM mutation_proposals WHERE id=? AND status='pending'")
        .get(id) as { payload: string } | undefined
      if (!row) throw new DomainError('NOT_FOUND', 'Pending proposal not found')
      const result = approved ? apply(JSON.parse(row.payload)) : null
      this.db
        .prepare('UPDATE mutation_proposals SET status=? WHERE id=?')
        .run(approved ? 'approved' : 'rejected', id)
      return result
    }, 'ai')
  }

  assertRevision(note: Note, expected?: number): void {
    if (expected !== undefined && expected !== note.revision)
      throw new DomainError('REVISION_CONFLICT', 'The note has changed since it was read', {
        expected,
        actual: note.revision,
      })
  }

  private recordRevision(id: string, operation: string): void {
    const note = this.aiGetNoteById(id, true)!
    const { content, tags, projectId, starred, archived, deletedAt } = note
    this.db
      .prepare(
        'INSERT INTO note_revisions (note_id,revision,source,operation,created_at,snapshot) VALUES (?,?,?,?,?,?)',
      )
      .run(
        id,
        note.revision,
        this.mutationSource,
        operation,
        new Date().toISOString(),
        JSON.stringify({ content, tags, projectId, starred, archived, deletedAt }),
      )
  }

  listRevisions(id: string, limit = 50): NoteRevision[] {
    const rows = this.db
      .prepare('SELECT * FROM note_revisions WHERE note_id = ? ORDER BY revision DESC LIMIT ?')
      .all(id, Math.max(1, Math.min(100, limit))) as Array<{
      note_id: string
      revision: number
      source: string
      operation: string
      created_at: string
      snapshot: string
    }>
    return rows.map((row) => ({
      noteId: row.note_id,
      revision: row.revision,
      source: row.source,
      operation: row.operation,
      createdAt: row.created_at,
      snapshot: JSON.parse(row.snapshot),
    }))
  }

  listRevisionSummaries(
    id: string,
    limit = 50,
  ): Array<{ revision: number; source: string; operation: string; createdAt: string; bytes: number }> {
    return this.db
      .prepare(
        'SELECT revision,source,operation,created_at AS createdAt,length(CAST(snapshot AS BLOB)) AS bytes FROM note_revisions WHERE note_id=? ORDER BY revision DESC LIMIT ?',
      )
      .all(id, Math.max(1, Math.min(100, limit))) as Array<{
      revision: number
      source: string
      operation: string
      createdAt: string
      bytes: number
    }>
  }
  getRevision(id: string, revision: number): NoteRevision | null {
    const row = this.db
      .prepare('SELECT * FROM note_revisions WHERE note_id=? AND revision=?')
      .get(id, revision) as
      | {
          note_id: string
          revision: number
          source: string
          operation: string
          created_at: string
          snapshot: string
        }
      | undefined
    return row
      ? {
          noteId: row.note_id,
          revision: row.revision,
          source: row.source,
          operation: row.operation,
          createdAt: row.created_at,
          snapshot: JSON.parse(row.snapshot),
        }
      : null
  }
  historyStats(): { revisions: number; bytes: number } {
    return this.db
      .prepare(
        'SELECT COUNT(*) AS revisions,COALESCE(SUM(length(CAST(snapshot AS BLOB))),0) AS bytes FROM note_revisions',
      )
      .get() as { revisions: number; bytes: number }
  }
  historyPrunePlan(keep: number): { count: number; bytes: number; fingerprint: string } {
    if (!Number.isSafeInteger(keep) || keep < 20 || keep > 10000)
      throw new DomainError('VALIDATION_ERROR', 'Keep between 20 and 10000 revisions per note')
    const hash = createHash('sha256').update(String(keep))
    let count = 0
    let bytes = 0
    const rows = this.db
      .prepare(
        `
      SELECT note_id,revision,length(CAST(snapshot AS BLOB)) AS bytes FROM (
        SELECT note_id,revision,snapshot,ROW_NUMBER() OVER(PARTITION BY note_id ORDER BY revision DESC) AS position
        FROM note_revisions
      ) WHERE position > ? ORDER BY note_id,revision
    `,
      )
      .iterate(keep) as Iterable<{ note_id: string; revision: number; bytes: number }>
    for (const row of rows) {
      count += 1
      bytes += row.bytes
      hash.update(JSON.stringify(row))
    }
    return { count, bytes, fingerprint: hash.digest('hex') }
  }
  pruneHistory(keep: number, expectedFingerprint?: string): number {
    return this.transaction(() => {
      const plan = this.historyPrunePlan(keep)
      if (expectedFingerprint !== undefined && plan.fingerprint !== expectedFingerprint)
        throw new DomainError(
          'REVISION_CONFLICT',
          'History changed. Preview cleanup again before applying it.',
        )
      return this.db
        .prepare(
          `
        DELETE FROM note_revisions WHERE (note_id,revision) IN (
          SELECT note_id,revision FROM (
            SELECT note_id,revision,ROW_NUMBER() OVER(PARTITION BY note_id ORDER BY revision DESC) AS position
            FROM note_revisions
          ) WHERE position > ?
        )
      `,
        )
        .run(keep).changes
    })
  }

  restoreRevision(id: string, revision: number, expectedRevision: number): Note | null {
    return this.transaction(() => {
      const current = this.aiGetNoteById(id, true)
      if (!current) return null
      this.assertRevision(current, expectedRevision)
      const row = this.db
        .prepare('SELECT snapshot FROM note_revisions WHERE note_id = ? AND revision = ?')
        .get(id, revision) as { snapshot: string } | undefined
      if (!row) throw new DomainError('NOT_FOUND', 'Revision not found')
      if (current.deletedAt) this.restoreNote(id)
      const snapshot = JSON.parse(row.snapshot) as NoteUpdatePatch
      return this.updateNote(id, snapshot)
    }, 'restore')
  }

  summarize(note: Note): NoteSummary {
    const { id, revision, createdAt, updatedAt, starred, archived, tags, projectId, deletedAt } = note
    return {
      id,
      revision,
      title: note.title ?? deriveNoteTitle(note.content),
      snippet: note.content.slice(0, 240),
      createdAt,
      updatedAt,
      starred,
      archived,
      tags,
      projectId,
      deletedAt,
    }
  }

  close(): void {
    try {
      this.db.exec('PRAGMA optimize')
    } catch {
      /* ignore — db may already be in bad state */
    }
    this.db.close()
    this.access.close()
  }

  /** Keep the coordination lease alive across physical database replacement. */
  closeForRestore(): () => void {
    this.access.exclusive()
    this.db.close()
    return () => this.access.close()
  }

  async backupTo(destination_path: string): Promise<void> {
    await this.db.backup(destination_path)
    await sanitizeBackup(destination_path, databaseEntry)
  }

  assertStandaloneCredentialsSafe(): void {
    const pending = this.db.prepare("SELECT 1 FROM settings WHERE key='credentialSanitizationPending'").get()
    const read = this.db.prepare('SELECT value FROM settings WHERE key=?')
    const legacy = SECRET_KEYS.some((key) => {
      const row = read.get(key) as { value: string } | undefined
      if (!row) return false
      try {
        return Boolean(JSON.parse(row.value))
      } catch {
        return true
      }
    })
    if (pending || legacy)
      throw new DomainError(
        'CREDENTIAL_MIGRATION_REQUIRED',
        'Open this library in Strata desktop once to migrate legacy provider credentials into OS-encrypted storage before starting the standalone server. Use the same STRATA_USER_DATA_DIR for both.',
      )
  }

  attachSecretStore(store: SecretStore): void {
    // Persist and verify each key before deleting its only plaintext copy.
    let migrated = Boolean(
      this.db.prepare("SELECT 1 FROM settings WHERE key='credentialSanitizationPending'").get(),
    )
    const read = this.db.prepare('SELECT value FROM settings WHERE key = ?')
    for (const key of SECRET_KEYS) {
      const row = read.get(key) as { value: string } | undefined
      const value = row ? (JSON.parse(row.value) as string) : ''
      if (row) migrated = true
      if (value) {
        store.set(key, value)
        if (store.get(key) !== value) throw new Error('Credential migration verification failed')
      }
    }
    this.db.pragma('secure_delete = ON')
    this.db.transaction(() => {
      if (migrated)
        this.db
          .prepare(
            "INSERT OR REPLACE INTO settings(key,value) VALUES ('credentialSanitizationPending','true')",
          )
          .run()
      for (const key of SECRET_KEYS) this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
    })()
    if (migrated) {
      const checkpoint = () => {
        const rows = this.db.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number }>
        if (rows.some((row) => row.busy !== 0))
          throw new Error('Close other Strata database processes to finish credential sanitization')
      }
      checkpoint()
      this.db.exec('VACUUM')
      checkpoint()
      this.db.prepare("DELETE FROM settings WHERE key='credentialSanitizationPending'").run()
    }
    this.secretStore = store
  }

  private runMigrations() {
    const current_version_row = this.db.prepare('PRAGMA user_version').get() as Record<string, number>
    let current_version = current_version_row.user_version ?? 0
    if (current_version > (migrations.at(-1)?.version ?? 0))
      throw new Error('This database requires a newer Strata version')

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
      if ((SECRET_KEYS as readonly string[]).includes(key)) continue
      insert.run(key, JSON.stringify(value))
    }
  }

  private mapNote(row: DbNoteRow): Note {
    return {
      id: row.id,
      revision: row.revision,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      starred: Boolean(row.starred),
      archived: Boolean(row.archived),
      tags: JSON.parse(row.tags) as string[],
      projectId: row.project_id,
      deletedAt: row.deleted_at,
      contentLoaded: true,
    }
  }

  private mapNoteSummary(row: DbNoteRow): Note {
    return {
      id: row.id,
      revision: row.revision,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      starred: Boolean(row.starred),
      archived: Boolean(row.archived),
      tags: JSON.parse(row.tags) as string[],
      projectId: row.project_id,
      deletedAt: row.deleted_at,
      contentLoaded: false,
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

  // Active-note tags are materialized and indexed by migration 11.
  private tagWhereFragment(): string {
    return 'n.id IN (SELECT note_id FROM note_tags WHERE tag = ?)'
  }

  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&')
  }

  private queryNotes(filters: NotesFilter = {}, summaries = false): Note[] {
    const values: unknown[] = []
    const where: string[] = []
    if (!filters.includeDeleted) where.push('n.deleted_at IS NULL')
    for (const field of ['starred', 'archived'] as const) {
      if (typeof filters[field] === 'boolean') {
        where.push(`n.${field} = ?`)
        values.push(filters[field] ? 1 : 0)
      }
    }
    if (filters.tag) {
      where.push(
        filters.includeDeleted
          ? 'EXISTS (SELECT 1 FROM json_each(n.tags) WHERE value = ?)'
          : this.tagWhereFragment(),
      )
      values.push(filters.tag)
    }
    if (filters.untagged) where.push('json_array_length(n.tags) = 0')
    if (filters.projectId) {
      where.push('n.project_id = ?')
      values.push(filters.projectId)
    }
    const terms = filters.query?.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 30) ?? []
    const ftsExpression = terms.map((term) => '"' + term.replace(/"/g, '""') + '"*').join(' AND ')
    const useFts =
      terms.length > 0 &&
      Boolean(
        this.db.prepare('SELECT rowid FROM notes_fts WHERE notes_fts MATCH ? LIMIT 1').get(ftsExpression),
      )
    let rank =
      filters.sort === 'created_desc'
        ? 'n.created_at DESC, n.id DESC'
        : filters.sort === 'title_asc'
          ? 'n.normalized_title ASC, n.id DESC'
          : 'n.updated_at DESC, n.id DESC'
    if (filters.query) {
      if (useFts) {
        where.push(
          `(n.rowid IN (SELECT note_rowid FROM search_scores UNION SELECT rowid FROM notes WHERE project_id IN (SELECT id FROM projects WHERE name LIKE ? ESCAPE '\\')))`,
        )
        values.push(`%${this.escapeLikePattern(filters.query)}%`)
      } else {
        where.push("(n.content LIKE ? ESCAPE '\\' OR n.tags LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')")
        const wildcard = `%${this.escapeLikePattern(filters.query)}%`
        values.push(wildcard, wildcard, wildcard)
      }
      rank = `CASE WHEN n.normalized_title = ? THEN 0 WHEN n.normalized_title LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, n.updated_at DESC, n.id DESC`
    }
    if (useFts) rank = rank.replace('n.updated_at DESC', `COALESCE(search_scores.score,0), n.updated_at DESC`)
    let offset = 0
    if (filters.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(filters.cursor, 'base64url').toString()) as {
          offset: number
          query: string
        }
        if (
          !Number.isSafeInteger(decoded.offset) ||
          decoded.offset < 0 ||
          decoded.offset > 1000000 ||
          decoded.query !== JSON.stringify({ ...filters, limit: undefined, cursor: undefined })
        )
          throw new Error()
        offset = decoded.offset
      } catch {
        throw new DomainError('INVALID_CURSOR', 'Cursor does not match these filters')
      }
    }
    if (filters.query)
      values.push(
        this.normalizeTitle(filters.query),
        this.escapeLikePattern(this.normalizeTitle(filters.query)) + '%',
      )
    if (useFts) values.unshift(ftsExpression)
    const limit =
      filters.limit === undefined ? (summaries ? 100 : -1) : Math.max(1, Math.min(200, filters.limit))
    values.push(limit, offset)
    const select = summaries
      ? `n.id,n.title,n.normalized_title,n.revision,substr(n.content,1,${NOTE_SUMMARY_CONTENT_LIMIT}) AS content,n.created_at,n.updated_at,n.starred,n.archived,n.tags,n.project_id,n.deleted_at`
      : 'n.*'
    const rows = this.db
      .prepare(
        ` ${useFts ? 'WITH search_scores AS MATERIALIZED (SELECT rowid AS note_rowid,bm25(notes_fts,8.0,1.0,4.0) AS score FROM notes_fts WHERE notes_fts MATCH ?)' : ''} SELECT ${select} FROM notes n LEFT JOIN projects p ON p.id=n.project_id ${useFts ? 'LEFT JOIN search_scores ON search_scores.note_rowid=n.rowid' : ''} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${rank} LIMIT ? OFFSET ?`,
      )
      .all(...values) as DbNoteRow[]
    return rows.map((row) => (summaries ? this.mapNoteSummary(row) : this.mapNote(row)))
  }

  listNotes(filters?: NotesFilter): Note[] {
    return this.queryNotes(filters)
  }
  listNoteSummaries(filters?: NotesFilter): Note[] {
    return this.queryNotes(filters, true)
  }
  listSummaryPage(filters: NotesFilter = {}): { notes: NoteSummary[]; nextCursor: string | null } {
    const limit = Math.max(1, Math.min(100, filters.limit ?? 50))
    const notes = this.listNoteSummaries({ ...filters, limit: limit + 1 })
    const offset = filters.cursor
      ? (JSON.parse(Buffer.from(filters.cursor, 'base64url').toString()) as { offset: number }).offset
      : 0
    return {
      notes: notes.slice(0, limit).map((note) => this.summarize(note)),
      nextCursor:
        notes.length > limit
          ? Buffer.from(
              JSON.stringify({
                offset: offset + limit,
                query: JSON.stringify({ ...filters, limit: undefined, cursor: undefined }),
              }),
            ).toString('base64url')
          : null,
    }
  }

  findCaptureDuplicate(content: string, projectId: string | null): Note | null {
    const hash = createHash('sha256').update(content.replace(/\r\n/g, '\n').trim()).digest('hex')
    const row = this.db
      .prepare(
        'SELECT id FROM notes WHERE content_hash=? AND project_id IS ? AND deleted_at IS NULL ORDER BY created_at,id LIMIT 1',
      )
      .get(hash, projectId) as { id: string } | undefined
    return row ? this.getNote(row.id) : null
  }

  getNote(id: string): Note | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL LIMIT 1').get(id) as
      | DbNoteRow
      | undefined
    if (!row) return null
    return this.mapNote(row)
  }

  createNote(initial?: {
    content?: string
    starred?: boolean
    archived?: boolean
    tags?: string[]
    projectId?: string | null
  }): Note {
    return this.db.transaction(() => {
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
      const title = deriveNoteTitle(content)
      this.db
        .prepare('UPDATE notes SET title = ?, normalized_title = ? WHERE id = ?')
        .run(title, this.normalizeTitle(title), id)
      this.rebuildLinksForContent(id, content)
      this.refreshLinkTargets([this.normalizeTitle(title)])
      this.recordRevision(id, 'create')
      const note = this.getNote(id)
      if (!note) throw new Error('Failed to create note')
      return note
    })()
  }

  updateNote(id: string, patch: NoteUpdatePatch): Note | null {
    return this.db.transaction(() => {
      const current = this.getNote(id)
      if (!current) return null
      this.assertRevision(current, patch.expectedRevision)

      const next_content = typeof patch.content === 'string' ? patch.content : current.content
      const next_starred = typeof patch.starred === 'boolean' ? patch.starred : current.starred
      const next_archived = typeof patch.archived === 'boolean' ? patch.archived : current.archived
      const next_tags = Array.isArray(patch.tags) ? patch.tags : current.tags
      const next_project_id = Object.prototype.hasOwnProperty.call(patch, 'projectId')
        ? (patch.projectId ?? null)
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
      if (!has_real_change && next_starred === current.starred && next_archived === current.archived)
        return current
      const next_updated = has_real_change ? new Date().toISOString() : current.updatedAt

      this.db
        .prepare(
          'UPDATE notes SET content = ?, starred = ?, archived = ?, tags = ?, project_id = ?, updated_at = ?, revision = revision + 1, title = ?, normalized_title = ? WHERE id = ? AND deleted_at IS NULL',
        )
        .run(
          next_content,
          next_starred ? 1 : 0,
          next_archived ? 1 : 0,
          JSON.stringify(next_tags),
          next_project_id,
          next_updated,
          deriveNoteTitle(next_content),
          this.normalizeTitle(deriveNoteTitle(next_content)),
          id,
        )

      // Rebuild wiki links when content changes
      if (typeof patch.content === 'string' && patch.content !== current.content) {
        this.rebuildLinksForContent(id, next_content)
        if (current.title !== deriveNoteTitle(next_content))
          this.refreshLinkTargets([
            this.normalizeTitle(current.title ?? deriveNoteTitle(current.content)),
            this.normalizeTitle(deriveNoteTitle(next_content)),
          ])
      }

      this.recordRevision(id, 'update')
      return this.getNote(id)
    })()
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
    return this.db.transaction(() => {
      const result = this.db
        .prepare(
          'UPDATE notes SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND deleted_at IS NULL',
        )
        .run(new Date().toISOString(), new Date().toISOString(), id)
      if (result.changes) {
        this.recordRevision(id, 'delete')
        this.refreshTitlesForNote(id)
      }
      return result.changes > 0
    })()
  }

  restoreNote(id: string): Note | null {
    return this.db.transaction(() => {
      const result = this.db
        .prepare(
          'UPDATE notes SET deleted_at = NULL, updated_at = ?, revision = revision + 1 WHERE id = ? AND deleted_at IS NOT NULL',
        )
        .run(new Date().toISOString(), id)
      if (0 === result.changes) return null
      this.recordRevision(id, 'restore')
      this.refreshTitlesForNote(id)
      return this.getNote(id)
    })()
  }

  archiveNote(id: string, archived: boolean): Note | null {
    return this.updateNote(id, { archived })
  }

  starNote(id: string, starred: boolean): Note | null {
    return this.updateNote(id, { starred })
  }

  listProjects(): Project[] {
    const rows = this.db
      .prepare('SELECT * FROM projects ORDER BY sort_order ASC, name COLLATE NOCASE ASC')
      .all() as DbProjectRow[]
    return rows.map((row) => this.mapProject(row))
  }

  listProjectSummaries(): ProjectSummary[] {
    const rows = this.db
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM notes n WHERE n.project_id=p.id AND n.deleted_at IS NULL) AS note_count,
         (SELECT MAX(updated_at) FROM notes n WHERE n.project_id=p.id AND n.deleted_at IS NULL) AS latest_note_updated_at
         FROM projects p ORDER BY p.sort_order ASC, p.name COLLATE NOCASE ASC`,
      )
      .all() as Array<DbProjectRow & { note_count: number; latest_note_updated_at: string | null }>
    return rows.map((row) => ({
      ...this.mapProject(row),
      noteCount: row.note_count,
      latestNoteUpdatedAt: row.latest_note_updated_at,
    }))
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1').get(id) as
      | DbProjectRow
      | undefined
    if (!row) return null
    return this.mapProject(row)
  }

  projectReviewState(
    id: string,
    includeNotes: boolean,
  ): { project: Project | null; noteCount: number; fingerprint: string } {
    const project = this.getProject(id)
    const hash = createHash('sha256').update(JSON.stringify(project))
    let noteCount = 0
    if (includeNotes) {
      // Stream IDs/revisions only; project deletion also affects archived/deleted members.
      const rows = this.db
        .prepare('SELECT id, revision FROM notes WHERE project_id = ? ORDER BY id')
        .iterate(id)
      for (const row of rows) {
        const note = row as { id: string; revision: number }
        hash.update(JSON.stringify([note.id, note.revision]))
        noteCount++
      }
    }
    return { project, noteCount, fingerprint: hash.digest('hex') }
  }

  getProjectByName(name: string): Project | null {
    const normalized = name.trim()
    if (!normalized) return null
    const row = this.db
      .prepare('SELECT * FROM projects WHERE name = ? COLLATE NOCASE LIMIT 1')
      .get(normalized) as DbProjectRow | undefined
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
    const next_sort_order_row = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order FROM projects')
      .get() as { next_sort_order?: number } | undefined
    const next_sort_order = next_sort_order_row?.next_sort_order ?? 0
    this.db
      .prepare('INSERT INTO projects (id, name, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(id, normalized, now, now, next_sort_order)
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
    const result = this.db
      .prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
      .run(normalized, new Date().toISOString(), id)
    if (0 === result.changes) return null
    return this.getProject(id)
  }

  deleteProject(id: string): boolean {
    const transaction = this.db.transaction((project_id: string) => {
      const affected = this.db.prepare('SELECT id FROM notes WHERE project_id = ?').all(project_id) as Array<{
        id: string
      }>
      this.db
        .prepare(
          'UPDATE notes SET project_id = NULL, revision = revision + 1, updated_at = ? WHERE project_id = ?',
        )
        .run(new Date().toISOString(), project_id)
      for (const note of affected) this.recordRevision(note.id, 'project_deleted')
      const deleted = this.db.prepare('DELETE FROM projects WHERE id = ?').run(project_id)
      return deleted.changes > 0
    })
    return transaction(id)
  }

  listTags(): Array<{ name: string; count: number }> {
    return this.db
      .prepare(`SELECT tag AS name, COUNT(*) AS count FROM note_tags GROUP BY tag ORDER BY tag`)
      .all() as Array<{ name: string; count: number }>
  }

  listAiThreads(): AiThreadSummary[] {
    const rows = this.db.prepare('SELECT * FROM ai_threads ORDER BY updated_at DESC').all() as DbAiThreadRow[]
    const last_message_stmt = this.db.prepare(
      'SELECT * FROM ai_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    return rows.map((thread_row) => {
      const last_message_row = last_message_stmt.get(thread_row.id) as DbAiMessageRow | undefined
      return {
        thread: this.mapAiThread(thread_row),
        lastMessage: last_message_row ? this.mapAiMessage(last_message_row) : null,
      }
    })
  }

  getAiThread(id: string): AiThread | null {
    const row = this.db.prepare('SELECT * FROM ai_threads WHERE id = ? LIMIT 1').get(id) as
      | DbAiThreadRow
      | undefined
    if (!row) return null
    return this.mapAiThread(row)
  }

  createAiThread(title: string, model: string): AiThread {
    const now = new Date().toISOString()
    const id = uuidv4()
    this.db
      .prepare('INSERT INTO ai_threads (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, title, model, now, now)
    const created = this.getAiThread(id)
    if (!created) throw new Error('Failed to create AI thread')
    return created
  }

  setAiThreadModel(id: string, model: string): AiThread | null {
    const result = this.db
      .prepare('UPDATE ai_threads SET model = ?, updated_at = ? WHERE id = ?')
      .run(model, new Date().toISOString(), id)
    if (0 === result.changes) return null
    return this.getAiThread(id)
  }

  setAiThreadTitle(id: string, title: string): AiThread | null {
    const result = this.db
      .prepare('UPDATE ai_threads SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, new Date().toISOString(), id)
    if (0 === result.changes) return null
    return this.getAiThread(id)
  }

  deleteAiThread(id: string): boolean {
    const transaction = this.db.transaction((thread_id: string) => {
      this.db
        .prepare(
          `UPDATE mutation_proposals SET status='rejected'
        WHERE status='pending' AND json_extract(payload, '$.actor.threadId') = ?`,
        )
        .run(thread_id)
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
    const rows = this.db
      .prepare('SELECT * FROM ai_messages WHERE thread_id = ? ORDER BY created_at ASC')
      .all(thread_id) as DbAiMessageRow[]
    return rows.map((row) => this.mapAiMessage(row))
  }

  listRecentAiMessages(thread_id: string, limit = 40): AiMessage[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new DomainError('VALIDATION_ERROR', 'Recent message limit must be between 1 and 100')
    const rows = this.db
      .prepare('SELECT * FROM ai_messages WHERE thread_id = ? ORDER BY created_at DESC,rowid DESC LIMIT ?')
      .all(thread_id, limit) as DbAiMessageRow[]
    return rows.reverse().map((row) => this.mapAiMessage(row))
  }

  createAiMessage(thread_id: string, role: 'user' | 'assistant' | 'system', content: string): AiMessage {
    const now = new Date().toISOString()
    const id = uuidv4()
    this.db
      .prepare('INSERT INTO ai_messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, thread_id, role, content, now)
    this.touchAiThread(thread_id)
    const row = this.db.prepare('SELECT * FROM ai_messages WHERE id = ? LIMIT 1').get(id) as
      | DbAiMessageRow
      | undefined
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

  aiListNotes(limit = 15, include_archived = true): Note[] {
    return this.listNoteSummaries({ limit, archived: include_archived ? undefined : false })
  }
  aiSearchNotes(query: string, limit = 20): Note[] {
    return this.listNoteSummaries({ query, limit })
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
    this.db
      .prepare(
        `INSERT INTO ai_note_edits (id, note_id, thread_id, message_id, action, before_content, after_content, before_tags, after_tags, before_project_id, after_project_id, model, prompt_excerpt, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
    this.db
      .prepare('UPDATE ai_note_edits SET after_revision = ? WHERE id = ?')
      .run(this.getNote(edit.noteId)?.revision ?? null, id)
    return id
  }

  /** Record a routing decision log entry. Best-effort — failures are silent. */
  private sanitizeRouteLogs(): void {
    if (this.db.prepare("SELECT 1 FROM settings WHERE key='routeLogPrivacyVersion'").get()) return
    this.transaction(() => {
      this.db.prepare("UPDATE ai_route_logs SET user_message='',reason=NULL,fallback_reason=NULL").run()
      this.db.prepare("INSERT INTO settings(key,value) VALUES('routeLogPrivacyVersion','1')").run()
    })
  }

  clearRouteLogs(): number {
    return this.db.prepare('DELETE FROM ai_route_logs').run().changes
  }

  pruneRouteLogs(now = Date.now()): number {
    const days = this.getSettings().aiRouteLogRetentionDays
    if (days === 0) return 0
    const cutoff = new Date(now - (days === 7 ? 7 : 30) * 86400000).toISOString()
    return this.db.prepare('DELETE FROM ai_route_logs WHERE created_at < ?').run(cutoff).changes
  }

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
    if (!this.getSettings().aiEnableRouteLogs) return ''
    this.pruneRouteLogs()
    const id = uuidv4()
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO ai_route_logs (id, thread_id, user_message, intent, route, provider_id, model, confidence, risk, requires_confirmation, reason, fallback_used, fallback_reason, input_tokens, output_tokens, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        log.threadId ?? null,
        '',
        log.intent,
        log.route,
        log.providerId,
        log.model,
        log.confidence ?? null,
        log.risk ?? null,
        log.requiresConfirmation ? 1 : 0,
        null,
        log.fallbackUsed ? 1 : 0,
        null,
        log.inputTokens ?? null,
        log.outputTokens ?? null,
        now,
      )
    return id
  }

  /** Get the most recent AI edit for a note (non-reverted). */
  getLatestAiEdit(note_id: string): AiNoteEdit | null {
    const row = this.db
      .prepare(
        'SELECT * FROM ai_note_edits WHERE note_id = ? AND reverted_at IS NULL ORDER BY created_at DESC LIMIT 1',
      )
      .get(note_id) as DbAiNoteEditRow | undefined
    if (!row) return null
    return this.mapAiNoteEdit(row)
  }

  /** Mark an AI edit as reverted and restore the previous content/tags. */
  revertAiEdit(edit_id: string): boolean {
    return this.db.transaction(() => {
      const edit = this.db
        .prepare('SELECT * FROM ai_note_edits WHERE id = ? AND reverted_at IS NULL')
        .get(edit_id) as DbAiNoteEditRow | undefined
      if (!edit) return false

      const note = this.getNote(edit.note_id)
      if (!note) return false

      const revisionRow = this.db
        .prepare('SELECT after_revision FROM ai_note_edits WHERE id = ?')
        .get(edit_id) as { after_revision: number | null }
      if (revisionRow.after_revision === null || note.revision !== revisionRow.after_revision)
        throw new DomainError(
          'REVISION_CONFLICT',
          'Note changed since this AI edit; choose an explicit history restore',
        )
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
    })()
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
    this.pruneRouteLogs()
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
    this.pruneRouteLogs()
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
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string
      value: string
    }>
    const merged = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      const parsed = JSON.parse(row.value)
      if (row.key in merged) {
        ;(merged as Record<string, unknown>)[row.key] = parsed
      }
    }
    for (const key of SECRET_KEYS) merged[key] = this.secretStore?.get(key) ?? ''
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
  rebuildLinks(
    source_note_id: string,
    links: Array<{ rawTarget: string; label: string | null; heading: string | null }>,
  ): void {
    const tx = this.db.transaction(() => {
      // Remove old links for this source
      this.db.prepare('DELETE FROM note_links WHERE source_note_id = ?').run(source_note_id)

      const insert = this.db.prepare(
        'INSERT INTO note_links (id, source_note_id, target_note_id, raw_target, label, heading, link_type, created_at, normalized_target) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
          this.normalizeTitle(link.rawTarget),
        )
      }
    })
    tx()
  }

  private normalizeTitle(title: string): string {
    return title.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  private refreshTitlesForNote(id: string): void {
    const row = this.db.prepare('SELECT normalized_title FROM notes WHERE id = ?').get(id) as {
      normalized_title: string
    }
    this.refreshLinkTargets([row.normalized_title])
  }

  private refreshLinkTargets(titles: string[]): void {
    for (const title of new Set(titles)) {
      const target = this.resolveLinkTarget(title)
      this.db
        .prepare('UPDATE note_links SET target_note_id = ? WHERE normalized_target = ?')
        .run(target?.id ?? null, title)
    }
  }

  findNotesByTitle(title: string): Note[] {
    const rows = this.db
      .prepare('SELECT * FROM notes WHERE normalized_title = ? AND deleted_at IS NULL ORDER BY id LIMIT 20')
      .all(this.normalizeTitle(title)) as DbNoteRow[]
    return rows.map((row) => this.mapNote(row))
  }

  findNoteSummariesByTitle(title: string): NoteSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, revision, substr(content,1,280) AS content,
      created_at, updated_at, starred, archived, tags, project_id, deleted_at
      FROM notes WHERE normalized_title = ? AND deleted_at IS NULL ORDER BY id LIMIT 20`,
      )
      .all(this.normalizeTitle(title)) as DbNoteRow[]
    return rows.map((row) => this.summarize(this.mapNoteSummary(row)))
  }

  resolveLinkTarget(raw_target: string): Note | null {
    const matches = this.findNotesByTitle(raw_target)
    return matches.length === 1 ? matches[0] : null
  }

  /** Get all notes that link TO the given note (backlinks). */
  getBacklinks(target_note_id: string): Array<{ link: NoteLink; source: Note }> {
    const rows = this.db
      .prepare(
        `SELECT l.*, n.id AS note_id, n.title, n.revision, substr(n.content,1,280) AS content, n.created_at AS note_created_at, n.updated_at, n.starred,n.archived,n.tags,n.project_id,n.deleted_at FROM note_links l JOIN notes n ON n.id=l.source_note_id WHERE l.target_note_id=? AND n.deleted_at IS NULL ORDER BY l.created_at DESC LIMIT 100`,
      )
      .all(target_note_id) as Array<DbNoteLinkRow & DbNoteRow & { note_id: string; note_created_at: string }>
    return rows.map((row) => ({
      link: this.mapNoteLink(row),
      source: this.mapNoteSummary({ ...row, id: row.note_id, created_at: row.note_created_at }),
    }))
  }

  getRelatedNotes(id: string): Array<{ note: Note; reason: string; score: number }> {
    const current = this.db
      .prepare('SELECT tags,project_id FROM notes WHERE id=? AND deleted_at IS NULL')
      .get(id) as { tags: string; project_id: string | null } | undefined
    if (!current) return []
    // Each signal contributes a bounded pool; bodies are never loaded for scoring.
    const rows = this.db
      .prepare(
        `WITH candidates AS (
			SELECT target_note_id AS id,50 AS score,'Linked from this note' AS reason FROM note_links WHERE source_note_id=? AND target_note_id IS NOT NULL LIMIT 100
		), incoming AS (
			SELECT source_note_id AS id,50 AS score,'Links here' AS reason FROM note_links WHERE target_note_id=? LIMIT 100
		), tagged AS (
			SELECT DISTINCT nt.note_id AS id,10 AS score,'Shared tag' AS reason FROM note_tags nt INDEXED BY idx_note_tags_tag WHERE nt.tag IN (SELECT value FROM json_each(?)) AND nt.note_id<>? LIMIT 100
		), grouped AS (
			SELECT id,5 AS score,'Shared project' AS reason FROM notes WHERE project_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id LIMIT 50
		), pooled AS (SELECT * FROM candidates UNION ALL SELECT * FROM incoming UNION ALL SELECT * FROM tagged UNION ALL SELECT * FROM grouped)
		SELECT n.id,n.title,n.revision,substr(n.content,1,280) AS content,n.created_at,n.updated_at,n.starred,n.archived,n.tags,n.project_id,n.deleted_at,SUM(p.score) AS score,GROUP_CONCAT(DISTINCT p.reason) AS reason
		FROM pooled p JOIN notes n ON n.id=p.id WHERE n.id<>? AND n.deleted_at IS NULL GROUP BY n.id ORDER BY score DESC,n.updated_at DESC,n.id LIMIT 8`,
      )
      .all(id, id, current.tags, id, current.project_id, id) as Array<
      DbNoteRow & { score: number; reason: string }
    >
    return rows.map((row) => ({ note: this.mapNoteSummary(row), score: row.score, reason: row.reason }))
  }

  /** Get the excerpt around a wiki link in a source note's content (for backlink previews). */
  /** Get the excerpt around a wiki link in a source note's content (for backlink previews). */
  getLinkExcerpt(source_note_id: string, raw_target: string, context_chars = 60): string | null {
    const note = this.getNote(source_note_id)
    if (!note) return null
    const content = note.content
    const pattern = new RegExp(
      `\\[\\[${raw_target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:#[^\\]|]+)?(?:\\|[^\\]]+)?\\]\\]`,
      'i',
    )
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
    const rows = this.db
      .prepare('SELECT source_note_id, target_note_id, raw_target FROM note_links ORDER BY created_at DESC')
      .all() as Array<{ source_note_id: string; target_note_id: string | null; raw_target: string }>
    return rows.map((r) => ({
      sourceNoteId: r.source_note_id,
      targetNoteId: r.target_note_id,
      rawTarget: r.raw_target,
    }))
  }

  setSettings(patch: Partial<Settings>): Settings {
    for (const key of SECRET_KEYS) {
      if (patch[key] === undefined || patch[key] === SECRET_PRESENT) continue
      if (!this.secretStore) throw new Error('OS credential storage is unavailable')
      this.secretStore.set(key, patch[key]!)
    }
    const now = this.getSettings()
    const next = { ...now, ...patch }
    const upsert = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    for (const [key, value] of Object.entries(next)) {
      if ((SECRET_KEYS as readonly string[]).includes(key)) continue
      upsert.run(key, JSON.stringify(value))
    }
    if (patch.aiRouteLogRetentionDays !== undefined) this.pruneRouteLogs()
    return this.getSettings()
  }
}
