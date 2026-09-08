import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { StrataDatabase } from '@main/db'
import { KnowledgeService } from '@main/services/knowledgeService'
const cleanups: Array<() => void> = []
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn()),
)
const open = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-domain-'))
  const db = new StrataDatabase(dir)
  cleanups.push(() => {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return { db, dir, service: new KnowledgeService(db) }
}
describe('transactional knowledge contracts', () => {
  it('rejects stale human/agent writes and records all meaningful mutations', () => {
    const { db, service } = open()
    const note = db.createNote({ content: '# Initial' })
    expect(note.revision).toBe(1)
    service.mutate(
      { op: 'update_note', id: note.id, payload: { content: '# Agent', expectedRevision: 1 } },
      { source: 'agent' },
    )
    expect(() =>
      service.mutate(
        { op: 'update_note', id: note.id, payload: { content: '# Human', expectedRevision: 1 } },
        { source: 'human' },
      ),
    ).toThrow('changed since')
    expect(db.getNote(note.id)?.content).toBe('# Agent')
    expect(db.listRevisions(note.id).map((r) => r.source)).toEqual(['agent', 'system'])
    db.starNote(note.id, true)
    expect(db.getNote(note.id)?.revision).toBe(3)
    db.updateNote(note.id, { starred: true })
    expect(db.getNote(note.id)?.revision).toBe(3)
    db.deleteNote(note.id)
    db.restoreNote(note.id)
    expect(db.getNote(note.id)?.revision).toBe(5)
    expect(() => db.restoreRevision(note.id, 1, 3)).toThrow('changed since')
    expect(db.restoreRevision(note.id, 1, 5)?.content).toBe('# Initial')
  })
  it('rolls back note, project, history and links on batch failure and dry-run', () => {
    const { db, service } = open()
    const note = db.createNote({ content: '# A' })
    const operations = [
      { op: 'create_note', payload: { content: '# Transient\n[[A]]', projectName: 'Transient' } },
      { op: 'update_note', id: note.id, payload: { content: 'stale', expectedRevision: 9 } },
    ]
    expect(() => service.batch({ operations })).toThrow('changed since')
    expect(db.listNotes()).toHaveLength(1)
    expect(db.listProjects()).toEqual([])
    expect(db.getBacklinks(note.id)).toEqual([])
    service.batch({ operations: [operations[0]], dryRun: true })
    expect(db.listNotes()).toHaveLength(1)
    expect(db.listProjects()).toEqual([])
  })
  it('replays idempotent creation and rejects key reuse for a different payload', () => {
    const { db, service } = open()
    const operation = { op: 'create_note', payload: { content: '# Once' } }
    expect(service.mutate(operation, { key: 'retry-1' })).toEqual(
      service.mutate(operation, { key: 'retry-1' }),
    )
    expect(db.listNotes()).toHaveLength(1)
    expect(() =>
      service.mutate({ ...operation, payload: { content: '# Twice' } }, { key: 'retry-1' }),
    ).toThrow('different operation')
  })
  it('maintains FTS/title/link indexes and represents duplicate title ambiguity', () => {
    const { db } = open()
    const source = db.createNote({ content: '# Source\n[[Target]]' })
    const target = db.createNote({ content: '# Target\nAstronomy quasars' })
    expect(db.getBacklinks(target.id)[0]?.source.id).toBe(source.id)
    expect(db.aiSearchNotes('quasar').map((n) => n.id)).toContain(target.id)
    const duplicate = db.createNote({ content: '# Target' })
    expect(db.resolveLinkTarget('target')).toBeNull()
    expect(db.getBacklinks(target.id)).toEqual([])
    db.deleteNote(duplicate.id)
    expect(db.resolveLinkTarget('target')?.id).toBe(target.id)
    db.updateNote(target.id, { content: '# Renamed\nBotany' })
    expect(db.getBacklinks(target.id)).toEqual([])
    expect(db.aiSearchNotes('quasar')).toEqual([])
  })
  it('bounds summaries with a validated cursor and retains full exact reads', () => {
    const { db } = open()
    for (let i = 0; i < 8; i++) db.createNote({ content: `# Note ${i}\n` + 'body '.repeat(300) })
    const first = db.listSummaryPage({ limit: 3 })
    const second = db.listSummaryPage({ limit: 3, cursor: first.nextCursor! })
    expect(first.notes).toHaveLength(3)
    expect(second.notes).toHaveLength(3)
    expect(new Set([...first.notes, ...second.notes].map((n) => n.id)).size).toBe(6)
    expect(first.notes[0]).not.toHaveProperty('content')
    expect(first.notes[0].snippet.length).toBeLessThanOrEqual(240)
    expect(db.getNote(first.notes[0].id)!.content.length).toBeGreaterThan(1000)
    expect(() => db.listSummaryPage({ tag: 'changed', cursor: first.nextCursor! })).toThrow('Cursor')
  })
  it('continues substring fallback across multiple pages',()=>{
    const {db}=open()
    for(let i=0;i<6;i++) db.createNote({content:`# Category ${i}\ncategory42`})
    const first=db.listSummaryPage({query:'gory42',limit:2})
    const second=db.listSummaryPage({query:'gory42',limit:2,cursor:first.nextCursor!})
    expect(first.notes).toHaveLength(2);expect(second.notes).toHaveLength(2)
    expect(new Set([...first.notes,...second.notes].map(note=>note.id)).size).toBe(4)
  })

  it('refuses a future schema without modifying it',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'strata-future-'))
    const db=new StrataDatabase(dir);db.close()
    const raw=new Database(path.join(dir,'data/strata.sqlite'))
    try {
      raw.pragma('user_version=999')
      expect(()=>new StrataDatabase(dir)).toThrow('newer Strata')
      expect(raw.pragma('user_version',{simple:true})).toBe(999)
    } finally {raw.close();fs.rmSync(dir,{recursive:true,force:true})}
  })

  it('enforces declared foreign keys and cascades', () => {
    const { db, dir } = open()
    const note = db.createNote({ content: '# Cascade' })
    const raw = new Database(path.join(dir, 'data/strata.sqlite'))
    raw.pragma('foreign_keys=ON')
    try {
      expect(() => db.createAiMessage('missing', 'user', 'orphan')).toThrow('FOREIGN KEY')
      raw.prepare('DELETE FROM notes WHERE id=?').run(note.id)
      expect(db.listRevisions(note.id)).toEqual([])
      expect(raw.pragma('foreign_key_check')).toEqual([])
    } finally {
      raw.close()
    }
  })
  it('refuses reverting an AI edit over newer changes', () => {
    const { db } = open()
    const note = db.createNote({ content: 'before' })
    db.updateNote(note.id, { content: 'AI' })
    const edit = db.recordAiEdit({
      noteId: note.id,
      action: 'update',
      beforeContent: 'before',
      afterContent: 'AI',
    })
    db.updateNote(note.id, { content: 'human' })
    expect(() => db.revertAiEdit(edit)).toThrow('changed since')
    expect(db.getNote(note.id)?.content).toBe('human')
  })
})
