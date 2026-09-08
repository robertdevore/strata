export interface Migration {
  version: number
  description: string
  upSql: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    description: 'initial schema',
    upSql: `
			CREATE TABLE IF NOT EXISTS notes (
				id TEXT PRIMARY KEY,
				content TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				starred INTEGER NOT NULL DEFAULT 0,
				archived INTEGER NOT NULL DEFAULT 0,
				tags TEXT NOT NULL DEFAULT '[]',
				deleted_at TEXT NULL
			);

			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
		`,
  },
  {
    version: 2,
    description: 'ai chat threads and messages',
    upSql: `
			CREATE TABLE IF NOT EXISTS ai_threads (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS ai_messages (
				id TEXT PRIMARY KEY,
				thread_id TEXT NOT NULL,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				created_at TEXT NOT NULL,
				FOREIGN KEY (thread_id) REFERENCES ai_threads (id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created ON ai_messages (thread_id, created_at ASC);
			CREATE INDEX IF NOT EXISTS idx_ai_messages_content ON ai_messages (content);
		`,
  },
  {
    version: 3,
    description: 'ai thread model tracking',
    upSql: `
			ALTER TABLE ai_threads ADD COLUMN model TEXT NULL;
		`,
  },
  {
    version: 4,
    description: 'note wiki links',
    upSql: `
			CREATE TABLE IF NOT EXISTS note_links (
				id TEXT PRIMARY KEY,
				source_note_id TEXT NOT NULL,
				target_note_id TEXT,
				raw_target TEXT NOT NULL,
				label TEXT,
				heading TEXT,
				link_type TEXT NOT NULL DEFAULT 'wiki',
				created_at TEXT NOT NULL,
				FOREIGN KEY (source_note_id) REFERENCES notes (id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links (source_note_id);
			CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links (target_note_id);
			CREATE INDEX IF NOT EXISTS idx_note_links_raw_target ON note_links (raw_target);
		`,
  },
  {
    version: 5,
    description: 'ai edit history',
    upSql: `
			CREATE TABLE IF NOT EXISTS ai_note_edits (
				id TEXT PRIMARY KEY,
				note_id TEXT NOT NULL,
				thread_id TEXT,
				message_id TEXT,
				action TEXT NOT NULL,
				before_content TEXT,
				after_content TEXT,
				before_tags TEXT,
				after_tags TEXT,
				model TEXT,
				prompt_excerpt TEXT,
				created_at TEXT NOT NULL,
				reverted_at TEXT,
				FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_ai_edits_note ON ai_note_edits (note_id, created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_ai_edits_thread ON ai_note_edits (thread_id);
		`,
  },
  {
    version: 6,
    description: 'ai route logs',
    upSql: `
			CREATE TABLE IF NOT EXISTS ai_route_logs (
				id TEXT PRIMARY KEY,
				thread_id TEXT,
				user_message TEXT NOT NULL,
				intent TEXT NOT NULL,
				route TEXT NOT NULL,
				provider_id TEXT NOT NULL,
				model TEXT NOT NULL,
				confidence REAL,
				risk TEXT,
				requires_confirmation INTEGER NOT NULL DEFAULT 0,
				reason TEXT,
				fallback_used INTEGER NOT NULL DEFAULT 0,
				fallback_reason TEXT,
				input_tokens INTEGER,
				output_tokens INTEGER,
				created_at TEXT NOT NULL
			);

			CREATE INDEX IF NOT EXISTS idx_route_logs_thread ON ai_route_logs (thread_id, created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_route_logs_intent ON ai_route_logs (intent, created_at DESC);
		`,
  },
  {
    version: 7,
    description: 'projects and note grouping',
    upSql: `
			CREATE TABLE IF NOT EXISTS projects (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL COLLATE NOCASE UNIQUE,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			ALTER TABLE notes ADD COLUMN project_id TEXT NULL;
			CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes (project_id);
			CREATE INDEX IF NOT EXISTS idx_projects_name ON projects (name);
		`,
  },
  {
    version: 8,
    description: 'ai edit project tracking',
    upSql: `
				ALTER TABLE ai_note_edits ADD COLUMN before_project_id TEXT;
				ALTER TABLE ai_note_edits ADD COLUMN after_project_id TEXT;
			`,
  },
  {
    version: 9,
    description: 'project ordering',
    upSql: `
				ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
				UPDATE projects
				SET sort_order = (
					SELECT COUNT(*)
					FROM projects AS other
					WHERE other.name COLLATE NOCASE < projects.name COLLATE NOCASE
				);
				CREATE INDEX IF NOT EXISTS idx_projects_sort_order ON projects (sort_order);
			`,
  },
  {
    version: 10,
    description: 'indexed titles, FTS search and universal revisions',
    upSql: `
			ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT 'Untitled';
			ALTER TABLE notes ADD COLUMN normalized_title TEXT NOT NULL DEFAULT 'untitled';
			ALTER TABLE notes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
			UPDATE notes SET title = strata_title(content), normalized_title = strata_normalize(strata_title(content));
			CREATE INDEX idx_notes_title ON notes(normalized_title) WHERE deleted_at IS NULL;
			CREATE INDEX idx_notes_updated ON notes(updated_at DESC, id DESC);
			ALTER TABLE note_links ADD COLUMN normalized_target TEXT NOT NULL DEFAULT '';
			UPDATE note_links SET normalized_target = strata_normalize(raw_target);
			CREATE INDEX idx_links_normalized ON note_links(normalized_target);
			CREATE VIRTUAL TABLE notes_fts USING fts5(title, content, tags, content='notes', content_rowid='rowid', tokenize='unicode61');
			INSERT INTO notes_fts(notes_fts) VALUES('rebuild');
			CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN
				INSERT INTO notes_fts(rowid,title,content,tags) VALUES(new.rowid,new.title,new.content,new.tags);
			END;
			CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
				INSERT INTO notes_fts(notes_fts,rowid,title,content,tags) VALUES('delete',old.rowid,old.title,old.content,old.tags);
			END;
			CREATE TRIGGER notes_fts_update AFTER UPDATE OF title,content,tags ON notes BEGIN
				INSERT INTO notes_fts(notes_fts,rowid,title,content,tags) VALUES('delete',old.rowid,old.title,old.content,old.tags);
				INSERT INTO notes_fts(rowid,title,content,tags) VALUES(new.rowid,new.title,new.content,new.tags);
			END;
			CREATE TABLE note_revisions (
				note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
				revision INTEGER NOT NULL,
				source TEXT NOT NULL,
				operation TEXT NOT NULL,
				created_at TEXT NOT NULL,
				snapshot TEXT NOT NULL,
				PRIMARY KEY(note_id, revision)
			);
			INSERT INTO note_revisions SELECT id,revision,'system','migration',updated_at,
				json_object('content',content,'tags',json(tags),'projectId',project_id,'starred',json(CASE starred WHEN 1 THEN 'true' ELSE 'false' END),'archived',json(CASE archived WHEN 1 THEN 'true' ELSE 'false' END),'deletedAt',deleted_at) FROM notes;
			ALTER TABLE ai_note_edits ADD COLUMN after_revision INTEGER;
			CREATE TABLE operation_receipts (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL);
			CREATE TABLE mutation_proposals (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
		`,
  },
]
