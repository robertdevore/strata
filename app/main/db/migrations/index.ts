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
]
