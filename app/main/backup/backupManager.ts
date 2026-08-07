import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import type { Settings } from '../../shared/types'
import { probeDatabase } from '../db/recovery'

const frequency_to_ms: Record<Settings['autoBackupFrequency'], number> = {
	off: 0,
	'12h': 12 * 60 * 60 * 1000,
	'24h': 24 * 60 * 60 * 1000,
	'168h': 7 * 24 * 60 * 60 * 1000,
}

interface BackupManagerOptions {
	dbFilePath: string
	backupDir: string
	getSettings: () => Settings
	backupDatabase: (destinationPath: string) => Promise<void>
	onAutoBackupCreated: (created_at: string) => void
}

export interface BackupResult {
	createdAt: string
	directory: string
	files: string[]
}

export interface BackupListing {
	name: string
	createdAt: string
	sizeBytes: number
}

export interface BackupRestorePreparation {
	sourcePath: string
	stagingDirectory: string
}

const ensure_dir = (directory: string): void => {
	if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true })
}

const pad = (value: number): string => String(value).padStart(2, '0')

const format_stamp = (date: Date): string => {
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

const collect_db_files = (db_file_path: string): string[] => {
	const files = [db_file_path]
	const wal = `${db_file_path}-wal`
	const shm = `${db_file_path}-shm`
	if (fs.existsSync(wal)) files.push(wal)
	if (fs.existsSync(shm)) files.push(shm)
	return files
}

const unique_directory = (parent_directory: string, prefix: string): string => {
	let candidate = path.join(parent_directory, prefix)
	let suffix = 1
	while (fs.existsSync(candidate)) {
		candidate = path.join(parent_directory, `${prefix}-${suffix}`)
		suffix += 1
	}
	return candidate
}

const resolve_database_path = (source_path: string): string => {
	const resolved_path = path.resolve(source_path)
	if (fs.existsSync(resolved_path) && fs.statSync(resolved_path).isDirectory()) {
		return path.join(resolved_path, 'strata.sqlite')
	}
	return resolved_path
}

const copy_database_bundle = async (source_path: string, destination_directory: string): Promise<void> => {
	const source_database_path = resolve_database_path(source_path)
	if (!fs.existsSync(source_database_path) || !fs.statSync(source_database_path).isFile()) {
		throw new Error('The selected backup does not contain a strata.sqlite database file.')
	}

	ensure_dir(destination_directory)
	for (const source_file of collect_db_files(source_database_path)) {
		await fsPromises.copyFile(source_file, path.join(destination_directory, path.basename(source_file)))
	}
}

export class BackupManager {
	private readonly db_file_path: string
	private readonly backup_dir: string
	private readonly get_settings: () => Settings
	private readonly backup_database: (destinationPath: string) => Promise<void>
	private readonly on_auto_backup_created: (created_at: string) => void
	private timer_id: NodeJS.Timeout | null = null
	private running = false

	constructor(options: BackupManagerOptions) {
		this.db_file_path = options.dbFilePath
		this.backup_dir = options.backupDir
		this.get_settings = options.getSettings
		this.backup_database = options.backupDatabase
		this.on_auto_backup_created = options.onAutoBackupCreated
		ensure_dir(this.backup_dir)
	}

	getBackupDirectory(): string {
		return this.backup_dir
	}

	/** List recent backups from the backup directory. */
	listRecentBackups(limit = 3): BackupListing[] {
		if (!fs.existsSync(this.backup_dir)) return []

		const entries = fs.readdirSync(this.backup_dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => {
				const full_path = path.join(this.backup_dir, entry.name)
				let size_bytes = 0
				try {
					const files = fs.readdirSync(full_path, { withFileTypes: true })
					for (const file of files) {
						if (file.isFile()) {
							try {
								size_bytes += fs.statSync(path.join(full_path, file.name)).size
							} catch { /* skip unreadable files */ }
						}
					}
				} catch { /* skip unreadable dirs */ }

				let created_at = ''
				try {
					created_at = fs.statSync(full_path).birthtime.toISOString()
				} catch {
					created_at = new Date(0).toISOString()
				}

				return { name: entry.name, createdAt: created_at, sizeBytes: size_bytes }
			})
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
			.slice(0, limit)

		return entries
	}

	async createBackupNow(reason: 'manual' | 'auto' | 'pre-restore' = 'manual'): Promise<BackupResult> {
		const now = new Date()
		const backup_folder = unique_directory(this.backup_dir, `${format_stamp(now)}-${reason}`)
		ensure_dir(backup_folder)

		const destination_file = path.join(backup_folder, path.basename(this.db_file_path))
		await this.backup_database(destination_file)

		return {
			createdAt: now.toISOString(),
			directory: backup_folder,
			files: [destination_file],
		}
	}

	getBackupPath(name: string): string {
		if (path.basename(name) !== name || !name) throw new Error('Invalid backup name.')
		const backup_path = path.join(this.backup_dir, name)
		if (!fs.existsSync(backup_path) || !fs.statSync(backup_path).isDirectory()) {
			throw new Error('Backup not found.')
		}
		return path.join(backup_path, 'strata.sqlite')
	}

	async prepareRestore(source_path: string): Promise<BackupRestorePreparation> {
		const source_database_path = resolve_database_path(source_path)
		if (!fs.existsSync(source_database_path) || !fs.statSync(source_database_path).isFile()) {
			throw new Error('The selected backup does not contain a strata.sqlite database file.')
		}

		await this.createBackupNow('pre-restore')
		const staging_directory = unique_directory(this.backup_dir, `imported-${format_stamp(new Date())}`)
		await copy_database_bundle(source_database_path, staging_directory)
		const staged_database_path = path.join(staging_directory, 'strata.sqlite')
		const probe_error = await probeDatabase(staged_database_path)
		if (probe_error) {
			throw new Error(`The selected backup failed SQLite validation: ${probe_error.message}`)
		}

		return {
			sourcePath: source_database_path,
			stagingDirectory: staging_directory,
		}
	}

	commitRestore(preparation: BackupRestorePreparation): string {
		const data_directory = path.dirname(this.db_file_path)
		const preserved_directory = unique_directory(data_directory, `pre-restore-current-${format_stamp(new Date())}`)
		ensure_dir(preserved_directory)

		for (const current_file of collect_db_files(this.db_file_path)) {
			if (fs.existsSync(current_file)) {
				fs.renameSync(current_file, path.join(preserved_directory, path.basename(current_file)))
			}
		}

		try {
			for (const staged_file of collect_db_files(path.join(preparation.stagingDirectory, 'strata.sqlite'))) {
				if (fs.existsSync(staged_file)) {
					fs.copyFileSync(staged_file, path.join(data_directory, path.basename(staged_file)))
				}
			}
		} catch (error) {
			for (const current_file of collect_db_files(this.db_file_path)) {
				if (fs.existsSync(current_file)) fs.renameSync(current_file, path.join(data_directory, `failed-restore-${path.basename(current_file)}`))
			}
			for (const preserved_file of collect_db_files(path.join(preserved_directory, 'strata.sqlite'))) {
				if (fs.existsSync(preserved_file)) fs.renameSync(preserved_file, path.join(data_directory, path.basename(preserved_file)))
			}
			throw error
		}

		return preserved_directory
	}

	async checkAutoBackup(): Promise<void> {
		if (this.running) return
		this.running = true

		try {
			const settings = this.get_settings()
			const frequency_ms = frequency_to_ms[settings.autoBackupFrequency]
			if (!frequency_ms) return

			const last = settings.lastAutoBackupAt ? new Date(settings.lastAutoBackupAt).getTime() : 0
			if (last && !Number.isFinite(last)) return

			const now_ms = Date.now()
			if (last && now_ms - last < frequency_ms) return

			const result = await this.createBackupNow('auto')
			this.on_auto_backup_created(result.createdAt)
		} catch (error) {
			console.error('[strata-backup] Auto backup failed', error)
		} finally {
			this.running = false
		}
	}

	start(): void {
		this.stop()
		this.checkAutoBackup()
		this.timer_id = setInterval(() => {
			this.checkAutoBackup()
		}, 15 * 60 * 1000)
	}

	stop(): void {
		if (!this.timer_id) return
		clearInterval(this.timer_id)
		this.timer_id = null
	}
}
