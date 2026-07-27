import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import { StrataDatabase } from './index'

const require = createRequire(import.meta.url)

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

const probe_database_in_worker = async (db_path: string): Promise<Error | null> => {
	const better_sqlite3_path = require.resolve('better-sqlite3')
	const worker_source = `
		const { parentPort, workerData } = require('node:worker_threads')
		try {
			const Database = require(workerData.betterSqlite3Path)
			const db = new Database(workerData.dbPath, { readonly: true, fileMustExist: true })
			const row = db.prepare('PRAGMA quick_check').get()
			db.close()
			const value = String(Object.values(row ?? {})[0] ?? '')
			parentPort.postMessage({ ok: value === 'ok', message: value || 'sqlite quick_check returned no result' })
		} catch (error) {
			parentPort.postMessage({
				ok: false,
				message: error instanceof Error ? error.message : String(error),
				code: error && typeof error === 'object' && 'code' in error ? String(error.code) : '',
			})
		}
	`

	return await new Promise<Error | null>((resolve) => {
		let settled = false
		const worker = new Worker(worker_source, {
			eval: true,
			workerData: {
				betterSqlite3Path: better_sqlite3_path,
				dbPath: db_path,
			},
		})

		const settle = (error: Error | null) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			void worker.terminate()
			resolve(error)
		}

		const timer = setTimeout(() => {
			settle(new Error('database quick_check timed out'))
		}, 5000)

		worker.once('message', (result: { ok?: boolean; message?: string; code?: string }) => {
			if (result.ok) {
				settle(null)
				return
			}
			const error = new Error(result.message || 'database quick_check failed')
			if (result.code) Object.assign(error, { code: result.code })
			settle(error)
		})

		worker.once('error', (error) => {
			settle(error)
		})

		worker.once('exit', (code) => {
			if (!settled && code !== 0) {
				settle(new Error(`database quick_check worker exited with code ${code}`))
			}
		})
	})
}

const preflight_database_error = async (user_data_path: string): Promise<Error | null> => {
	const db_path = path.join(user_data_path, 'data', 'strata.sqlite')
	if (!fs.existsSync(db_path)) return null
	return await probe_database_in_worker(db_path)
}

export const openStrataDatabaseWithRecovery = async (user_data_path: string): Promise<DatabaseRecoveryResult> => {
	const preflight_error = await preflight_database_error(user_data_path)
	if (preflight_error) {
		const backup_dir = quarantine_database_files(user_data_path)
		return {
			db: new StrataDatabase(user_data_path),
			recovered: true,
			backupDir: backup_dir,
			originalError: preflight_error,
		}
	}

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
