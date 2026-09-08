import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'

it('finds sparse shared-tag candidates once without hydrating the current body', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-related-candidates-'))
  const db = new StrataDatabase(directory)
  try {
    for (let i = 0; i < 110; i++) db.createNote({ content: `# Unrelated ${i}`, tags: ['common'] })
    const both = db.createNote({ content: '# Both\n\n' + 'large '.repeat(1000), tags: ['rare-a', 'rare-b'] })
    const archived = db.createNote({ content: '# Archived', tags: ['rare-b'], archived: true })
    const removed = db.createNote({ content: '# Deleted', tags: ['rare-a'] })
    db.deleteNote(removed.id)
    const current = db.createNote({ content: '# Current\n\n[[Both]]', tags: ['rare-a', 'rare-b'] })
    const get = vi.spyOn(db, 'getNote')
    const found = db.getRelatedNotes(current.id)
    expect(get).not.toHaveBeenCalled()
    get.mockRestore()
    expect(found.map((item) => item.note.id)).toEqual([both.id, archived.id])
    expect(found[0].score).toBe(60) // one direct link + one shared-tag signal, despite two matching tags
    expect(found[0].reason).toContain('Shared tag')
    expect(found[0].note.content.length).toBeLessThanOrEqual(280)
    expect(found[0].note.contentLoaded).toBe(false)
    db.updateNote(both.id, { tags: [] })
    expect(db.getRelatedNotes(current.id).find((item) => item.note.id === both.id)?.score).toBe(50)
    db.restoreNote(removed.id)
    expect(db.getRelatedNotes(current.id).some((item) => item.note.id === removed.id)).toBe(true)
    db.deleteNote(current.id)
    expect(db.getRelatedNotes(current.id)).toEqual([])
  } finally {
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
