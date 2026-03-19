import fs from 'node:fs'
import path from 'node:path'
import type { Settings } from '../../shared/types'

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
	onAutoBackupCreated: (created_at: string) => void
}

export interface BackupResult {
	createdAt: string
	directory: string
	files: string[]
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

export class BackupManager {
	private readonly db_file_path: string
	private readonly backup_dir: string
	private readonly get_settings: () => Settings
	private readonly on_auto_backup_created: (created_at: string) => void
	private timer_id: NodeJS.Timeout | null = null
	private running = false

	constructor(options: BackupManagerOptions) {
		this.db_file_path = options.dbFilePath
		this.backup_dir = options.backupDir
		this.get_settings = options.getSettings
		this.on_auto_backup_created = options.onAutoBackupCreated
		ensure_dir(this.backup_dir)
	}

	getBackupDirectory(): string {
		return this.backup_dir
	}

	createBackupNow(reason: 'manual' | 'auto' = 'manual'): BackupResult {
		const now = new Date()
		const stamp = format_stamp(now)
		const backup_folder = path.join(this.backup_dir, `${stamp}-${reason}`)
		ensure_dir(backup_folder)

		const copied_files: string[] = []
		for (const source_file of collect_db_files(this.db_file_path)) {
			const destination_file = path.join(backup_folder, path.basename(source_file))
			fs.copyFileSync(source_file, destination_file)
			copied_files.push(destination_file)
		}

		return {
			createdAt: now.toISOString(),
			directory: backup_folder,
			files: copied_files,
		}
	}

	checkAutoBackup(): void {
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

			const result = this.createBackupNow('auto')
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
