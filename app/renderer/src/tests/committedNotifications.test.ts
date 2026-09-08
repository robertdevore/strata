import { afterEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { KnowledgeService } from '@main/services/knowledgeService'
import { startNotesApiServer } from '@main/api/notesApiServer'
afterEach(() => vi.restoreAllMocks())
it('returns a committed create and approved proposal even when notification delivery throws', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-notify-'))
  const db = new StrataDatabase(dir)
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const service = new KnowledgeService(db, () => {
      throw new Error('private failure')
    })
    const first = service.mutate({ op: 'create_note', payload: { content: '# Saved' } }) as { id: string }
    expect(db.getNote(first.id)?.content).toBe('# Saved')
    const proposal = service.propose({ op: 'create_note', payload: { content: '# Approved' } })
    const approved = service.approve(proposal.id, true) as { id: string }
    expect(db.getNote(approved.id)?.content).toBe('# Approved')
    expect(db.listProposals()).toEqual([])
    expect(warning.mock.calls).toEqual([
      ['[Strata] Data-change notification failed after commit.'],
      ['[Strata] Data-change notification failed after commit.'],
    ])
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

it('returns HTTP success for an already-committed restore when its listener fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-notify-http-'))
  const db = new StrataDatabase(dir)
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  let server: Awaited<ReturnType<typeof startNotesApiServer>> | undefined
  try {
    const note = db.createNote({ content: '# Before' })
    const updated = db.updateNote(note.id, { content: '# After', expectedRevision: note.revision })!
    const token = 'synthetic-notification-fixture-token-000000000000'
    server = await startNotesApiServer(db, {
      host: '127.0.0.1',
      port: 0,
      token,
      onDataChanged: () => {
        throw new Error('private listener failure')
      },
    })
    const response = await fetch(`http://127.0.0.1:${server.port}/v1/notes/${note.id}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 1, expectedRevision: updated.revision }),
    })
    expect(response.status).toBe(200)
    expect((await response.json()).note).toMatchObject({
      id: note.id,
      content: '# Before',
      revision: updated.revision + 1,
    })
    expect(db.getNote(note.id)?.content).toBe('# Before')
    expect(warning).toHaveBeenCalledWith('[Strata] Data-change notification failed after commit.')
  } finally {
    await server?.close()
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
