import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { KnowledgeService } from '@main/services/knowledgeService'
it('rechecks linked-note existence and records/notifies only an actual creation', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-linked-note-'))
  const db = new StrataDatabase(directory)
  const notify = vi.fn()
  const service = new KnowledgeService(db, notify)
  try {
    const first = service.createMissingLinkedNote('Indexed target')
    expect(first.content).toBe('# Indexed target\n\n')
    const second = service.createMissingLinkedNote('  INDEXED target  ')
    expect(second.id).toBe(first.id)
    expect(db.listRevisions(first.id)).toHaveLength(1)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ notes: true, links: true, history: true }))
    expect(() => service.createMissingLinkedNote('Invalid\ntitle')).toThrow()
    expect(notify).toHaveBeenCalledTimes(1)
  } finally {
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
