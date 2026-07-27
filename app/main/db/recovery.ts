import fs from 'node:fs'
import path from 'node:path'
import { StrataDatabase } from './index'

export interface DatabaseRecoveryResult {
	db: StrataDatabase
	recovered: boolean
	backupDir: string | null
	originalError: unknown | null
}

const is_database_corruption_error = (error: unknown): boolean => {
	if (!(error instanceof Error)) return false
	const maybe_code = 'code' in error ? String(error.code) : ''
	const message = error.message.toLowerCase()
	return (
		'SQLITE_CORRUPT' === maybe_code
		|| 'SQLITE_NOTADB' === maybe_code
		|| message.includes('database disk image is malformed')
		|| message.includes('file is not a database')
	)
}

const safe_timestamp = (): string => new Date().toISOString().replace(/[:.]/g, '-')

const unique_backup_dir = (data_dir: string): string => {
	const base_dir = path.join(data_dir, `corrupt-strata-sqlite-${safe_timestamp()}`)
	let candidate = base_dir
	let suffix = 1
	while (fs.existsSync(candidate)) {
		candidate = `${base_dir}-${suffix}`
		suffix += 1
	}
	return candidate
}

const move_if_exists = (source: string, destination_dir: string): void => {
	if (!fs.existsSync(source)) return
	fs.mkdirSync(destination_dir, { recursive: true })
	fs.renameSync(source, path.join(destination_dir, path.basename(source)))
}

const quarantine_database_files = (user_data_path: string): string => {
	const data_dir = path.join(user_data_path, 'data')
	const db_path = path.join(data_dir, 'strata.sqlite')
	const backup_dir = unique_backup_dir(data_dir)
	move_if_exists(db_path, backup_dir)
	move_if_exists(`${db_path}-wal`, backup_dir)
	move_if_exists(`${db_path}-shm`, backup_dir)
	return backup_dir
}

export const openStrataDatabaseWithRecovery = (user_data_path: string): DatabaseRecoveryResult => {
	try {
		return {
			db: new StrataDatabase(user_data_path),
			recovered: false,
			backupDir: null,
			originalError: null,
		}
	} catch (error) {
		if (!is_database_corruption_error(error)) throw error
		const backup_dir = quarantine_database_files(user_data_path)
		return {
			db: new StrataDatabase(user_data_path),
			recovered: true,
			backupDir: backup_dir,
			originalError: error,
		}
	}
}
