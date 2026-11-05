import { afterEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { startNotesApiServer } from '@main/api/notesApiServer'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
const start = async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-response-'))
  const db = new StrataDatabase(directory)
  const notify = vi.fn()
  const token = 'synthetic-response-test-token-000000000000'
  const server = await startNotesApiServer(db, { port: 0, token, onDataChanged: notify })
  cleanups.push(async () => {
    await server.close()
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const send = (route: string, payload: unknown, method = 'POST', key = 'fixture') =>
    fetch(`http://127.0.0.1:${server.port}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify(payload),
    })
  return { db, notify, send }
}

it('rolls back oversized batch responses, revisions, receipts and notifications before reporting 413', async () => {
  const { db, notify, send } = await start()
  const notes = Array.from({ length: 6 }, () => db.createNote({ content: '# Large\n' + 'x'.repeat(750000) }))
  const operations = notes.map((note) => ({
    op: 'update_note',
    id: note.id,
    payload: { starred: true, expectedRevision: note.revision },
  }))
  const response = await send('/batch', { operations })
  expect(response.status).toBe(413)
  expect(await response.json()).toMatchObject({ error: { code: 'RESPONSE_TOO_LARGE' } })
  for (const note of notes) {
    expect(db.getNote(note.id)).toMatchObject({ starred: false, revision: note.revision })
    expect(db.listRevisions(note.id)).toHaveLength(1)
  }
  expect(notify).not.toHaveBeenCalled()
  // Reusing the rejected key for a smaller batch must not find a committed receipt.
  const retry = await send('/batch', { operations: operations.slice(0, 1) })
  expect(retry.status).toBe(200)
  expect((await retry.json()).results[0].result).toMatchObject({ starred: true, content: notes[0].content })
  expect(notify).toHaveBeenCalledOnce()
  const replay = await send('/batch', { operations: operations.slice(0, 1) })
  expect(replay.status).toBe(200)
  await replay.json()
  expect(notify).toHaveBeenCalledOnce()
})

it('rolls back a single metadata update when an existing note expands beyond the JSON response budget', async () => {
  const { db, notify, send } = await start()
  const note = db.createNote({ content: '# Escaped text\n' + '\u0000'.repeat(750000) })
  const response = await send(
    `/notes/${note.id}`,
    { starred: true, expectedRevision: note.revision },
    'PATCH',
  )
  expect(response.status).toBe(413)
  await response.json()
  expect(db.getNote(note.id)).toMatchObject({ starred: false, revision: note.revision })
  expect(notify).not.toHaveBeenCalled()
})

it('rolls back an oversized historical restore without adding history or announcing changes', async () => {
  const { db, notify, send } = await start()
  const note = db.createNote({ content: '# Historical\n' + '\u0000'.repeat(750000) })
  const current = db.updateNote(note.id, { content: '# Small', expectedRevision: note.revision })!
  const response = await send(`/notes/${note.id}/restore`, {
    revision: note.revision,
    expectedRevision: current.revision,
  })
  expect(response.status).toBe(413)
  await response.json()
  expect(db.getNote(note.id)).toMatchObject({ content: '# Small', revision: current.revision })
  expect(db.listRevisions(note.id)).toHaveLength(2)
  expect(notify).not.toHaveBeenCalled()
})
