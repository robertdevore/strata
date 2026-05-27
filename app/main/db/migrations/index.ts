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
]
