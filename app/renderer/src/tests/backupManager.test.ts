import { expect, it } from 'vitest'
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
})
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
