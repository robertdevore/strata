import { expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

it('backs up a live WAL database while removing credentials from the copy only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-admin-backup-'))
  const data = path.join(root, 'data')
  fs.mkdirSync(data)
  const source = new Database(path.join(data, 'strata.sqlite'))
  try {
    source.pragma('journal_mode=WAL')
    source.pragma('user_version=12')
    source.exec(
      'CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE notes(id TEXT PRIMARY KEY,content TEXT)',
    )
    const secret = 'UNIQUE-CREDENTIAL-MUST-NOT-SURVIVE-BACKUP'
    source.prepare('INSERT INTO settings VALUES (?,?)').run('openAiApiKey', JSON.stringify(secret))
    source.prepare('INSERT INTO notes VALUES (?,?)').run('note', 'Durable content')
    const output = path.join(root, 'output')
    await promisify(execFile)('python3', [path.resolve('scripts/backup-notes.py'), output], {
      env: { ...process.env, STRATA_USER_DATA_DIR: root },
      timeout: 10000,
    })
    const folder = path.join(output, fs.readdirSync(output)[0])
    const target = path.join(folder, 'strata.sqlite')
    const copied = new Database(target, { readonly: true })
    try {
      expect(copied.prepare('SELECT content FROM notes').get()).toEqual({ content: 'Durable content' })
      expect(copied.prepare('SELECT * FROM settings').all()).toEqual([])
      expect(copied.pragma('quick_check', { simple: true })).toBe('ok')
    } finally {
      copied.close()
    }
    expect(fs.readFileSync(target).includes(Buffer.from(secret))).toBe(false)
    expect(source.prepare('SELECT value FROM settings').get()).toEqual({ value: JSON.stringify(secret) })
    expect(JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'))).toMatchObject({
      schemaVersion: 12,
      integrity: 'ok',
      providerSecrets: false,
    })
    if (process.platform !== 'win32') expect(fs.statSync(target).mode & 0o777).toBe(0o600)
  } finally {
    source.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
