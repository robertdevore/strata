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
]
