import { expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { openStrataDatabaseWithRecovery } from '@main/db/recovery'

it('allows concurrent libraries but excludes restore until every other owner closes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-library-access-'))
  const first = new StrataDatabase(root)
  const second = new StrataDatabase(root)
  let firstClosed = false
  let secondClosed = false
  let release: (() => void) | undefined
  try {
    const note = first.createNote({ content: 'Shared library' })
    expect(second.getNote(note.id)?.content).toBe('Shared library')
    expect(() => first.closeForRestore()).toThrow('Close other Strata processes')
    // A refused restore retains normal access, including new owners and later writes.
    const third = new StrataDatabase(root)
    third.close()
    second.updateNote(note.id, { content: 'Later revision' })
    expect(first.getNote(note.id)?.content).toBe('Later revision')
    second.close()
    secondClosed = true
    release = first.closeForRestore()
    firstClosed = true
    expect(() => new StrataDatabase(root)).toThrow('opening or restoring')
    release()
    release = undefined
    const reopened = new StrataDatabase(root)
    expect(reopened.getNote(note.id)?.content).toBe('Later revision')
    reopened.close()
  } finally {
    release?.()
    if (!firstClosed) first.close()
    if (!secondClosed) second.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('releases cross-process shared leases after a process exits', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-library-process-'))
  const db = new StrataDatabase(root)
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
    const Database = require('better-sqlite3');
    const db = new Database(process.argv[1]);
    db.exec('BEGIN; SELECT * FROM library_access');
    process.send('ready');
    setInterval(() => {}, 1000);
  `,
      path.join(root, 'data/.strata-access.sqlite'),
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  )
  let closed = false
  try {
    await once(child, 'message', { signal: AbortSignal.timeout(5000) })
    expect(() => db.closeForRestore()).toThrow('Close other Strata processes')
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
    const release = db.closeForRestore()
    closed = true
    release()
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill('SIGKILL')
      await exited
    }
    if (!closed) db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('holds a lease throughout preflight and does not mistake coordination errors for note corruption', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-library-preflight-'))
  let db = new StrataDatabase(root)
  try {
    const note = db.createNote({ content: 'Preserve this library' })
    const release = db.closeForRestore()
    await expect(openStrataDatabaseWithRecovery(root)).rejects.toThrow('opening or restoring')
    release()
    const opened = await openStrataDatabaseWithRecovery(root)
    db = opened.db
    expect(opened.recovered).toBe(false)
    expect(db.getNote(note.id)?.content).toBe('Preserve this library')
    db.close()
    fs.writeFileSync(path.join(root, 'data/.strata-access.sqlite'), 'invalid coordination file')
    await expect(openStrataDatabaseWithRecovery(root)).rejects.toThrow('Cannot acquire safe access')
    expect(fs.readdirSync(path.join(root, 'data')).some((name) => name.startsWith('corrupt-'))).toBe(false)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
