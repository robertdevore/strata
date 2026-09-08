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
  it('keeps ranked FTS, project matches and exact tag filters consistent across pages', () => {
    const { db } = open()
    const project = db.createProject('Needle project')
    const exact = db.createNote({ content: '# Needle', tags: ['a%'] })
    const prefix = db.createNote({ content: '# Needle guide', tags: ['a%'] })
    const body = db.createNote({ content: '# Other\nneedle needle', tags: ['a%'] })
    const projectOnly = db.createNote({ content: '# Project only', projectId: project.id, tags: ['a%'] })
    db.createNote({ content: '# Needle excluded', tags: ['abc'] })
    const first = db.listSummaryPage({ query: 'needle', tag: 'a%', limit: 2 })
    expect(first.notes.map((note) => note.id)).toEqual([exact.id, prefix.id])
    const second = db.listSummaryPage({ query: 'needle', tag: 'a%', limit: 2, cursor: first.nextCursor! })
    expect(second.notes.map((note) => note.id)).toEqual([body.id, projectOnly.id])
    expect(second.nextCursor).toBeNull()
    expect(db.listSummaryPage({ tag: 'a%' }).notes).toHaveLength(4)
  })

  it('deduplicates captures by exact normalized content and project without merging', () => {
    const { db, service } = open()
    const input = {
      payload: { content: '# Decision\r\nKeep SQLite', tags: ['decision'], projectName: 'Project A' },
    }
    const first = service.capture(input)
    const duplicate = service.capture({
      payload: { ...input.payload, content: '# Decision\nKeep SQLite  ', tags: ['different'] },
    })
    expect(duplicate.duplicate).toBe(true)
    expect(duplicate.note.id).toBe(first.note.id)
    expect(duplicate.note.tags).toEqual(['decision'])
    expect(duplicate.note.revision).toBe(1)
    expect(db.listRevisions(first.note.id)[0].source).toBe('agent')
    const other = service.capture({ payload: { ...input.payload, projectName: 'Project B' } })
    expect(other.duplicate).toBe(false)
    db.updateNote(first.note.id, { content: 'changed' })
    expect(service.capture(input).duplicate).toBe(false)
    const count = db.listNotes().length
    service.capture({ payload: { content: 'dry', projectName: 'Rolled back' }, dryRun: true })
    expect(db.listNotes()).toHaveLength(count)
    expect(db.getProjectByName('Rolled back')).toBeNull()
    expect(service.capture({ ...input, dedupe: false }).duplicate).toBe(false)
    expect(db.listNotes()).toHaveLength(count + 1)
  })

  it('previews history cleanup and rejects changed plans while preserving recovery', () => {
    const { db } = open()
    const a = db.createNote({ content: 'a0' })
    const b = db.createNote({ content: 'b0' })
    for (let i = 1; i <= 25; i += 1) {
      db.updateNote(a.id, { content: `a${i}` })
      db.updateNote(b.id, { content: `b${i}` })
    }
    const plan = db.historyPrunePlan(20)
    expect(plan.count).toBe(12)
    expect(plan.bytes).toBeGreaterThan(0)
    expect(db.historyStats().revisions).toBe(52)
    expect(() => db.historyPrunePlan(19)).toThrow()
    db.deleteNote(b.id)
    expect(() => db.pruneHistory(20, plan.fingerprint)).toThrow('History changed')
    expect(db.historyStats().revisions).toBe(53)
    const next = db.historyPrunePlan(20)
    expect(db.pruneHistory(20, next.fingerprint)).toBe(13)
    expect(db.historyStats().revisions).toBe(40)
    expect(db.getNote(a.id)?.content).toBe('a25')
    expect(db.getNote(b.id)).toBeNull()
    expect(db.getRevision(a.id, 1)).toBeNull()
    expect(db.getRevision(a.id, 7)?.snapshot.content).toBe('a6')
    expect(db.restoreRevision(a.id, 7, 26)?.content).toBe('a6')
    expect(db.historyPrunePlan(20).count).toBe(1)
  })

  it('removes legacy routing excerpts when a library is opened', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-route-legacy-'))
    let db = new StrataDatabase(dir)
    try {
      db.setSettings({ aiEnableRouteLogs: true })
      db.recordRouteLog({
        userMessage: '',
        intent: 'general',
        route: 'cheap',
        providerId: 'custom',
        model: 'test',
      })
      db.close()
      const raw = new Database(path.join(dir, 'data', 'strata.sqlite'))
      try {
        raw.prepare("DELETE FROM settings WHERE key='routeLogPrivacyVersion'").run()
        raw
          .prepare(
            "UPDATE ai_route_logs SET user_message='private legacy message', reason='private legacy reason', fallback_reason='private provider error'",
          )
          .run()
      } finally {
        raw.close()
      }
      db = new StrataDatabase(dir)
      expect(JSON.stringify(db.listAiRouteLogs())).not.toContain('private')
      expect(db.listAiRouteLogs()).toHaveLength(1)
    } finally {
      db.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
  it('keeps routing logs opt-in, metadata-only, expiring and deletable', () => {
    const { db } = open()
    const log = {
      userMessage: 'private note and sk-secret',
      intent: 'general',
      route: 'cheap',
      providerId: 'custom',
      model: 'model',
      reason: 'private reasoning',
      fallbackReason: 'secret provider response',
    }
    expect(db.recordRouteLog(log)).toBe('')
    expect(db.listAiRouteLogs()).toEqual([])
    db.setSettings({ aiEnableRouteLogs: true })
    expect(db.recordRouteLog(log)).not.toBe('')
    const saved = db.listAiRouteLogs()[0]
    expect(saved.userMessage).toBe('')
    expect(saved.reason).toBeNull()
    expect(saved.fallbackReason).toBeNull()
    expect(db.pruneRouteLogs(Date.now() + 31 * 86400000)).toBe(1)
    db.setSettings({ aiRouteLogRetentionDays: 0 })
    db.recordRouteLog(log)
    expect(db.pruneRouteLogs(Date.now() + 366 * 86400000)).toBe(0)
    expect(db.clearRouteLogs()).toBe(1)
    expect(db.listAiRouteLogs()).toEqual([])
    db.setSettings({ aiRouteLogRetentionDays: 7 })
    db.recordRouteLog(log)
    expect(db.pruneRouteLogs(Date.now() + 8 * 86400000)).toBe(1)
  })

  it('imports bounded content atomically and rejects privileged path inputs', () => {
    const { db } = open()
    let notifications = 0
    const service = new KnowledgeService(db, () => {
      notifications += 1
    })
    expect(() => service.importFolder({ projectName: 'Paths', filePaths: ['/etc/passwd'] })).toThrow()
    expect(() =>
      service.importFolder({
        projectName: 'Too many',
        files: Array.from({ length: 51 }, () => ({ name: 'a.md', content: 'a' })),
      }),
    ).toThrow()
    // The second normalized document exceeds the note contract after the first insert.
    expect(() =>
      service.importFolder({
        projectName: 'Rollback',
        files: [
          { name: 'good.md', content: '# Good' },
          { name: 'large.md', content: 'x'.repeat(790000) },
        ],
      }),
    ).toThrow()
    expect(db.listProjects()).toEqual([])
    expect(db.listNotes()).toEqual([])
    expect(db.historyStats().revisions).toBe(0)
    expect(notifications).toBe(0)
    const result = service.importFolder({
      projectName: 'Imported',
      files: [
        { name: 'a.md', content: '# A\n[[B]]' },
        { name: 'b.md', content: '# B' },
      ],
    })
    expect(result.count).toBe(2)
    expect(db.getBacklinks(result.notes[1].id)).toHaveLength(1)
    expect(db.listRevisions(result.notes[0].id)[0].source).toBe('import')
    expect(notifications).toBe(1)
  })

  it('rejects stale metadata, deletion and undo after intervening edits', () => {
    const { db, service } = open()
    const note = db.createNote({ content: 'original' })
    db.updateNote(note.id, { content: 'external' })
    for (const payload of [{ starred: true }, { archived: true }]) {
      expect(() =>
        service.mutate({ op: 'update_note', id: note.id, payload: { ...payload, expectedRevision: 1 } }),
      ).toThrow('changed since')
    }
    expect(() => service.mutate({ op: 'delete_note', id: note.id, expectedRevision: 1 })).toThrow(
      'changed since',
    )
    service.mutate({ op: 'delete_note', id: note.id, expectedRevision: 2 })
    expect(() => service.mutate({ op: 'restore_note', id: note.id, expectedRevision: 2 })).toThrow(
      'changed since',
    )
    service.mutate({ op: 'restore_note', id: note.id, expectedRevision: 3 })
    service.mutate({ op: 'delete_note', id: note.id, expectedRevision: 4 })
    expect(() => service.mutate({ op: 'restore_note', id: note.id, expectedRevision: 3 })).toThrow(
      'changed since',
    )
    expect(db.getNote(note.id)).toBeNull()
    const restored = service.mutate({ op: 'restore_note', id: note.id, expectedRevision: 5 })
    expect(restored).toMatchObject({ content: 'external', revision: 6 })
  })
  it('notifies approval observers once after the pending proposal is resolved', () => {
    const { db } = open()
    const pendingCounts: number[] = []
    const service = new KnowledgeService(db, () => pendingCounts.push(db.listProposals().length))
    const proposal = service.propose({ op: 'create_note', payload: { content: 'approved' } })
    expect(pendingCounts).toEqual([])
    service.approve(proposal.id, true)
    expect(pendingCounts).toEqual([0])
  })

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
  it('continues substring fallback across multiple pages', () => {
    const { db } = open()
    for (let i = 0; i < 6; i++) db.createNote({ content: `# Category ${i}\ncategory42` })
    const first = db.listSummaryPage({ query: 'gory42', limit: 2 })
    const second = db.listSummaryPage({ query: 'gory42', limit: 2, cursor: first.nextCursor! })
    expect(first.notes).toHaveLength(2)
    expect(second.notes).toHaveLength(2)
    expect(new Set([...first.notes, ...second.notes].map((note) => note.id)).size).toBe(4)
  })

  it('refuses a future schema without modifying it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-future-'))
    const db = new StrataDatabase(dir)
    db.close()
    const raw = new Database(path.join(dir, 'data/strata.sqlite'))
    try {
      raw.pragma('user_version=999')
      expect(() => new StrataDatabase(dir)).toThrow('newer Strata')
      expect(raw.pragma('user_version', { simple: true })).toBe(999)
    } finally {
      raw.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
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
