import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { StrataDatabase } from '@main/db'
import {
  EncryptedSecretStore,
  redactSettings,
  SECRET_PRESENT,
  type SecretKey,
} from '@main/security/secretStore'

describe('provider credentials', () => {
  it('refuses standalone startup until legacy credentials and pending sanitization are resolved', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-standalone-credentials-'))
    const db = new StrataDatabase(dir)
    const raw = new Database(path.join(dir, 'data/strata.sqlite'))
    try {
      expect(() => db.assertStandaloneCredentialsSafe()).not.toThrow()
      raw
        .prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)')
        .run('openAiApiKey', JSON.stringify('private-test-key'))
      expect(() => db.assertStandaloneCredentialsSafe()).toThrow('Open this library in Strata desktop')
      expect(raw.prepare('SELECT value FROM settings WHERE key=?').get('openAiApiKey')).toEqual({
        value: JSON.stringify('private-test-key'),
      })
      const vault = new Map<string, string>()
      db.attachSecretStore({
        get: (key) => vault.get(key) ?? '',
        set: (key, value) => {
          vault.set(key, value)
        },
      })
      expect(vault.get('openAiApiKey')).toBe('private-test-key')
      expect(() => db.assertStandaloneCredentialsSafe()).not.toThrow()
      raw.prepare('INSERT INTO settings VALUES (?,?)').run('credentialSanitizationPending', 'true')
      expect(() => db.assertStandaloneCredentialsSafe()).toThrow('Open this library')
      await expect(
        promisify(execFile)(process.execPath, ['--import', 'tsx', path.resolve('app/standalone/server.ts')], {
          env: { ...process.env, STRATA_USER_DATA_DIR: dir },
          timeout: 10000,
        }),
      ).rejects.toMatchObject({ stderr: expect.stringContaining('CREDENTIAL_MIGRATION_REQUIRED') })
    } finally {
      raw.close()
      db.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)

  it('migrates plaintext only after verified storage and sanitizes backups', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-secrets-'))
    let db = new StrataDatabase(dir)
    db.close()
    const file = path.join(dir, 'data/strata.sqlite')
    const raw = new Database(file)
    raw
      .prepare('INSERT INTO settings (key,value) VALUES (?,?)')
      .run('openAiApiKey', JSON.stringify('test-secret-never-export'))
    raw.close()
    db = new StrataDatabase(dir)
    const memory = new Map<SecretKey, string>()
    try {
      await db.backupTo(path.join(dir, 'before.sqlite'))
      expect(
        fs.readFileSync(path.join(dir, 'before.sqlite')).includes(Buffer.from('test-secret-never-export')),
      ).toBe(false)
      db.attachSecretStore({
        get: (key) => memory.get(key) ?? '',
        set: (key, value) => {
          memory.set(key, value)
        },
      })
      expect(db.getSettings().openAiApiKey).toBe('test-secret-never-export')
      expect(redactSettings(db.getSettings()).openAiApiKey).toBe(SECRET_PRESENT)
      db.setSettings({ openAiApiKey: SECRET_PRESENT, theme: 'light' })
      expect(db.getSettings().openAiApiKey).toBe('test-secret-never-export')
      await db.backupTo(path.join(dir, 'after.sqlite'))
      expect(
        fs.readFileSync(path.join(dir, 'after.sqlite')).includes(Buffer.from('test-secret-never-export')),
      ).toBe(false)
      expect(fs.readFileSync(file).includes(Buffer.from('test-secret-never-export'))).toBe(false)
    } finally {
      db.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
  it('refuses plaintext OS encryption fallbacks', () => {
    const store = new EncryptedSecretStore('/unused', {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'basic_text',
      encryptString: Buffer.from,
      decryptString: () => '',
    })
    expect(() => store.set('openAiApiKey', 'secret')).toThrow('OS credential encryption is unavailable')
  })
  it('resumes sanitization after a concurrent reader blocks WAL truncation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-secret-reader-'))
    const db = new StrataDatabase(dir)
    const raw = new Database(path.join(dir, 'data/strata.sqlite'))
    const memory = new Map<SecretKey, string>()
    const store = {
      get: (key: SecretKey) => memory.get(key) ?? '',
      set: (key: SecretKey, value: string) => {
        memory.set(key, value)
      },
    }
    try {
      raw
        .prepare('INSERT INTO settings(key,value) VALUES (?,?)')
        .run('openAiApiKey', JSON.stringify('reader-blocked-secret'))
      raw.exec('BEGIN')
      raw.prepare('SELECT * FROM settings').all()
      expect(() => db.attachSecretStore(store)).toThrow('Close other Strata')
      raw.exec('COMMIT')
      db.attachSecretStore(store)
      expect(db.getSettings().openAiApiKey).toBe('reader-blocked-secret')
      expect(
        raw.prepare("SELECT * FROM settings WHERE key='credentialSanitizationPending'").get(),
      ).toBeUndefined()
    } finally {
      if (raw.inTransaction) raw.exec('ROLLBACK')
      raw.close()
      db.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 15000)
})
