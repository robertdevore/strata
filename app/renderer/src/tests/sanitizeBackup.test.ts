import { expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { sanitizeBackup } from '@main/db/sanitizeBackup'

it('fails closed without creating a missing snapshot or leaking worker module paths', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-backup-worker-'))
  const filename = path.join(directory, 'missing.sqlite')
  try {
    const require = createRequire(import.meta.url)
    await expect(sanitizeBackup(filename, require.resolve('better-sqlite3'))).rejects.toThrow(
      'Backup sanitization or integrity check failed',
    )
    expect(fs.existsSync(filename)).toBe(false)
    await expect(sanitizeBackup(filename, path.join(directory, 'missing-private-module'))).rejects.toThrow(
      'Backup sanitization or integrity check failed',
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
