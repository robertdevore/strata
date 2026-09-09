import { runtimeErrorCode } from '../../shared/runtimeLogging'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import type { Settings } from '../../shared/types'
import { probeDatabase } from '../db/recovery'
import { StrataDatabase } from '../db'

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

const resolve_database_path = (source_path: string): string => {
  const resolved_path = path.resolve(source_path)
  if (fs.existsSync(resolved_path) && fs.statSync(resolved_path).isDirectory()) {
    return path.join(resolved_path, 'strata.sqlite')
  }
  return resolved_path
}

export class BackupManager {
  private readonly db_file_path: string
  private readonly backup_dir: string
  private readonly get_settings: () => Settings
  private readonly backup_database: (destinationPath: string) => Promise<void>
  private readonly on_auto_backup_created: (created_at: string) => void
  private timer_id: NodeJS.Timeout | null = null
  private running = false
  private activeBackups = new Set<Promise<BackupResult>>()
  private automaticWork: Promise<void> | null = null

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

    const entries = fs
      .readdirSync(this.backup_dir, { withFileTypes: true })
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
              } catch {
                /* skip unreadable files */
              }
            }
          }
        } catch {
          /* skip unreadable dirs */
        }

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

  createBackupNow(reason: 'manual' | 'auto' | 'pre-restore' = 'manual'): Promise<BackupResult> {
    const work = this.createBackup(reason)
    this.activeBackups.add(work)
    void work.then(
      () => this.activeBackups.delete(work),
      () => this.activeBackups.delete(work),
    )
    return work
  }

  private async createBackup(reason: 'manual' | 'auto' | 'pre-restore'): Promise<BackupResult> {
    const now = new Date()
    const backup_folder = await fsPromises.mkdtemp(
      path.join(this.backup_dir, `${format_stamp(now)}-${reason}-`),
    )
    const destination_file = path.join(backup_folder, path.basename(this.db_file_path))
    try {
      await this.backup_database(destination_file)
      const probeError = await probeDatabase(destination_file)
      if (probeError) throw new Error('Backup failed SQLite validation')
      const copied = new Database(destination_file, { readonly: true })
      let schemaVersion: number
      try {
        copied.pragma('foreign_keys = ON')
        schemaVersion = copied.pragma('user_version', { simple: true }) as number
      } finally {
        copied.close()
      }
      await fsPromises.chmod(backup_folder, 0o700)
      await fsPromises.chmod(destination_file, 0o600)
      await fsPromises.writeFile(
        path.join(backup_folder, 'manifest.json'),
        JSON.stringify({
          format: 'strata-backup-v1',
          createdAt: now.toISOString(),
          reason,
          schemaVersion,
          integrity: 'ok',
        }) + '\n',
        { mode: 0o600 },
      )
      if (reason === 'auto')
        await this.pruneAutomaticBackups(backup_folder).catch(() =>
          console.warn('[strata-backup] Retention cleanup failed; verified backup preserved'),
        )
      return {
        createdAt: now.toISOString(),
        directory: backup_folder,
        files: [destination_file, path.join(backup_folder, 'manifest.json')],
      }
    } catch (error) {
      await fsPromises.rm(backup_folder, { recursive: true, force: true })
      throw error
    }
  }

  private async pruneAutomaticBackups(currentDirectory: string): Promise<void> {
    const keep = this.get_settings().autoBackupKeepCount
    if (![7, 30, 90].includes(keep)) return
    const candidates: Array<{ directory: string; createdAt: string }> = []
    for (const entry of await fsPromises.readdir(this.backup_dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const directory = path.join(this.backup_dir, entry.name)
      try {
        const manifest = JSON.parse(await fsPromises.readFile(path.join(directory, 'manifest.json'), 'utf8'))
        if (
          manifest.format === 'strata-backup-v1' &&
          manifest.reason === 'auto' &&
          manifest.integrity === 'ok' &&
          Number.isFinite(Date.parse(manifest.createdAt))
        )
          candidates.push({ directory, createdAt: manifest.createdAt })
      } catch {
        /* Preserve unknown or unreadable backups. */
      }
    }
    candidates.sort((a, b) =>
      a.directory === currentDirectory
        ? -1
        : b.directory === currentDirectory
          ? 1
          : b.createdAt.localeCompare(a.createdAt) || b.directory.localeCompare(a.directory),
    )
    for (const item of candidates.slice(keep))
      await fsPromises.rm(item.directory, { recursive: true, force: true })
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

    const staging_directory = await fsPromises.mkdtemp(path.join(this.backup_dir, 'imported-'))
    await fsPromises.chmod(staging_directory, 0o700)
    const staging_data = path.join(staging_directory, 'data')
    await fsPromises.mkdir(staging_data, { mode: 0o700 })
    const staged_database_path = path.join(staging_directory, 'strata.sqlite')
    try {
      // SQLite's online backup captures committed WAL state consistently, regardless of filename.
      const source = new Database(source_database_path, { readonly: true, fileMustExist: true })
      try {
        source.pragma('foreign_keys = ON')
        source
          .prepare(
            'SELECT id, content, created_at, updated_at, starred, archived, tags, deleted_at FROM notes LIMIT 0',
          )
          .all()
        source.prepare('SELECT key, value FROM settings LIMIT 0').all()
        await source.backup(path.join(staging_data, 'strata.sqlite'))
      } finally {
        source.close()
      }
      const probe_error = await probeDatabase(path.join(staging_data, 'strata.sqlite'))
      if (probe_error) throw new Error('The selected backup failed SQLite validation.')
      // Validate/migrate only the copy. The resulting restore file also excludes legacy secrets.
      const staged = new StrataDatabase(staging_directory)
      try {
        await staged.backupTo(staged_database_path)
      } finally {
        staged.close()
      }
      await fsPromises.chmod(staged_database_path, 0o600)
      await fsPromises.rm(staging_data, { recursive: true, force: true })
      return { sourcePath: source_database_path, stagingDirectory: staging_directory }
    } catch (error) {
      await fsPromises.rm(staging_directory, { recursive: true, force: true })
      throw error
    }
  }

  /** Caller must close all library writers before installing the prepared snapshot. */
  commitRestore(preparation: BackupRestorePreparation): string {
    const data_directory = path.dirname(this.db_file_path)
    const staged_file = path.join(preparation.stagingDirectory, 'strata.sqlite')
    const preserved_directory = fs.mkdtempSync(path.join(data_directory, 'pre-restore-current-'))
    fs.chmodSync(preserved_directory, 0o700)
    const installation_file = path.join(preserved_directory, 'replacement.sqlite')
    const originals = collect_db_files(this.db_file_path).filter((file) => fs.existsSync(file))
    let replacing = false
    try {
      // Finish every fallible copy before touching the current library.
      fs.copyFileSync(staged_file, installation_file, fs.constants.COPYFILE_EXCL)
      fs.chmodSync(installation_file, 0o600)
      for (const original of originals) {
        const preserved = path.join(preserved_directory, path.basename(original))
        fs.copyFileSync(original, preserved, fs.constants.COPYFILE_EXCL)
        fs.chmodSync(preserved, 0o600)
      }
      replacing = true
      for (const sidecar of [`${this.db_file_path}-wal`, `${this.db_file_path}-shm`])
        fs.rmSync(sidecar, { force: true })
      fs.renameSync(installation_file, this.db_file_path)
    } catch (error) {
      if (replacing) {
        // Keep the recovery copies even if rollback itself fails (for example, a full disk).
        for (const original of originals)
          fs.copyFileSync(path.join(preserved_directory, path.basename(original)), original)
      }
      throw error
    }
    return preserved_directory
  }

  checkAutoBackup(): Promise<void> {
    if (this.automaticWork) return this.automaticWork
    this.automaticWork = this.runAutoBackup().finally(() => {
      this.automaticWork = null
    })
    return this.automaticWork
  }

  private async runAutoBackup(): Promise<void> {
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
      console.error('[strata-backup] Auto backup failed', runtimeErrorCode(error))
    } finally {
      this.running = false
    }
  }

  start(): void {
    this.stop()
    this.checkAutoBackup()
    this.timer_id = setInterval(
      () => {
        this.checkAutoBackup()
      },
      15 * 60 * 1000,
    )
  }

  async stopAndDrain(): Promise<void> {
    this.stop()
    await this.automaticWork
    await Promise.allSettled([...this.activeBackups])
  }

  stop(): void {
    if (!this.timer_id) return
    clearInterval(this.timer_id)
    this.timer_id = null
  }
}
