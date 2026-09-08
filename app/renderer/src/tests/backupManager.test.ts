import { expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { BackupManager } from '@main/backup/backupManager'

it('verifies backups, retains automatic recovery points and restores note history', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-backup-check-'))
  let db = new StrataDatabase(root)
  const backupDir = path.join(root, 'backups')
  const options = {
    dbFilePath: path.join(root, 'data/strata.sqlite'),
    backupDir,
    getSettings: () => db.getSettings(),
    backupDatabase: (destination: string) => db.backupTo(destination),
    onAutoBackupCreated: () => {},
  }
  const manager = new BackupManager(options)
  try {
    const note = db.createNote({ content: '# Recoverable' })
    const manuals = await Promise.all([manager.createBackupNow(), manager.createBackupNow()])
    expect(manuals[0].directory).not.toBe(manuals[1].directory)
    const manifest = JSON.parse(fs.readFileSync(path.join(manuals[0].directory, 'manifest.json'), 'utf8'))
    expect(manifest).toMatchObject({ schemaVersion: 12, integrity: 'ok', reason: 'manual' })
    db.setSettings({ autoBackupKeepCount: 7 })
    for (let i = 0; i < 9; i++) await manager.createBackupNow('auto')
    const manifests = () =>
      fs
        .readdirSync(backupDir)
        .map((name) => JSON.parse(fs.readFileSync(path.join(backupDir, name, 'manifest.json'), 'utf8')))
    expect(manifests().filter((item) => item.reason === 'auto')).toHaveLength(7)
    expect(manifests().filter((item) => item.reason === 'manual')).toHaveLength(2)
    db.updateNote(note.id, { content: 'new content' })
    const preparation = await manager.prepareRestore(manuals[0].directory)
    db.close()
    manager.commitRestore(preparation)
    db = new StrataDatabase(root)
    expect(db.getNote(note.id)?.content).toBe('# Recoverable')
    expect(db.listRevisions(note.id)).toHaveLength(1)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}, 30000)
it('removes failed backup attempts instead of listing them as recovery points', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-backup-failure-'))
  const db = new StrataDatabase(root)
  const backupDir = path.join(root, 'backups')
  const manager = new BackupManager({
    dbFilePath: path.join(root, 'data/strata.sqlite'),
    backupDir,
    getSettings: () => db.getSettings(),
    backupDatabase: async (destination) => {
      fs.writeFileSync(destination, 'not sqlite')
    },
    onAutoBackupCreated: () => {},
  })
  try {
    await expect(manager.createBackupNow()).rejects.toThrow('validation')
    expect(fs.readdirSync(backupDir)).toEqual([])
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('imports an arbitrary database filename with committed live WAL content', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-restore-wal-'))
  const sourceRoot = path.join(root, 'source')
  const source = new StrataDatabase(sourceRoot)
  const current = new StrataDatabase(path.join(root, 'current'))
  const manager = new BackupManager({
    dbFilePath: path.join(root, 'current/data/strata.sqlite'),
    backupDir: path.join(root, 'backups'),
    getSettings: () => current.getSettings(),
    backupDatabase: (destination) => current.backupTo(destination),
    onAutoBackupCreated: () => {},
  })
  try {
    const note = source.createNote({ content: '# Live WAL note' })
    expect(fs.statSync(path.join(sourceRoot, 'data/strata.sqlite-wal')).size).toBeGreaterThan(0)
    const preparation = await manager.prepareRestore(path.join(sourceRoot, 'data/strata.sqlite'))
    const snapshot = new Database(path.join(preparation.stagingDirectory, 'strata.sqlite'), {
      readonly: true,
    })
    expect(snapshot.prepare('SELECT content FROM notes WHERE id=?').get(note.id)).toEqual({
      content: '# Live WAL note',
    })
    snapshot.close()
    const customName = path.join(root, 'my-backup.db')
    await source.backupTo(customName)
    const renamed = await manager.prepareRestore(customName)
    expect(fs.existsSync(path.join(renamed.stagingDirectory, 'strata.sqlite'))).toBe(true)
    expect(fs.existsSync(path.join(renamed.stagingDirectory, 'data'))).toBe(false)
    if (process.platform !== 'win32') {
      expect(fs.statSync(renamed.stagingDirectory).mode & 0o777).toBe(0o700)
      expect(fs.statSync(path.join(renamed.stagingDirectory, 'strata.sqlite')).mode & 0o777).toBe(0o600)
    }
  } finally {
    source.close()
    current.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('rejects unrelated and future databases without leaving failed imports', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-restore-invalid-'))
  const current = new StrataDatabase(root)
  const backupDir = path.join(root, 'backups')
  const manager = new BackupManager({
    dbFilePath: path.join(root, 'data/strata.sqlite'),
    backupDir,
    getSettings: () => current.getSettings(),
    backupDatabase: (destination) => current.backupTo(destination),
    onAutoBackupCreated: () => {},
  })
  try {
    const unrelatedPath = path.join(root, 'unrelated.db')
    const unrelated = new Database(unrelatedPath)
    unrelated.exec('CREATE TABLE unrelated (value TEXT)')
    unrelated.close()
    await expect(manager.prepareRestore(unrelatedPath)).rejects.toThrow()
    const futurePath = path.join(root, 'future.db')
    await current.backupTo(futurePath)
    const future = new Database(futurePath)
    future.pragma('user_version = 999')
    future.close()
    await expect(manager.prepareRestore(futurePath)).rejects.toThrow('newer Strata')
    expect(fs.readdirSync(backupDir)).toEqual([])
    expect(current.createNote({ content: 'Still writable' }).content).toBe('Still writable')
  } finally {
    current.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('preserves the current database when installation fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-restore-install-'))
  let db = new StrataDatabase(root)
  const manager = new BackupManager({
    dbFilePath: path.join(root, 'data/strata.sqlite'),
    backupDir: path.join(root, 'backups'),
    getSettings: () => db.getSettings(),
    backupDatabase: (destination) => db.backupTo(destination),
    onAutoBackupCreated: () => {},
  })
  try {
    const note = db.createNote({ content: 'Before' })
    const backup = await manager.createBackupNow()
    db.updateNote(note.id, { content: 'Latest saved content' })
    const preparation = await manager.prepareRestore(backup.directory)
    db.close()
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('Injected install failure')
    })
    try {
      expect(() => manager.commitRestore(preparation)).toThrow('Injected install failure')
    } finally {
      rename.mockRestore()
    }
    db = new StrataDatabase(root)
    expect(db.getNote(note.id)?.content).toBe('Latest saved content')
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
