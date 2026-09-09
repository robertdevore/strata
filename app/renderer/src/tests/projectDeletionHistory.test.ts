import { expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { StrataDatabase } from '@main/db'

it('records every resulting project deletion snapshot with exact metadata and actor', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-project-history-'))
  const db = new StrataDatabase(directory)
  try {
    const project = db.createProject('Deleted project')
    const active = db.createNote({
      content: '# Café\n\n"Quoted" evidence',
      projectId: project.id,
      tags: ['evidence'],
      starred: true,
      archived: true,
    })
    const removed = db.createNote({ content: '# Trashed', projectId: project.id })
    db.deleteNote(removed.id)
    const deleted = db.aiGetNoteById(removed.id, true)!
    const untouched = db.createNote({ content: '# Unassigned' })
    db.transaction(() => db.deleteProject(project.id), 'api')
    for (const before of [active, deleted]) {
      const after = db.aiGetNoteById(before.id, true)!
      expect(after).toMatchObject({
        ...before,
        revision: before.revision + 1,
        projectId: null,
        updatedAt: after.updatedAt,
      })
      expect(db.getRevision(before.id, after.revision)).toMatchObject({
        source: 'api',
        operation: 'project_deleted',
        snapshot: {
          content: before.content,
          tags: before.tags,
          projectId: null,
          starred: before.starred,
          archived: before.archived,
          deletedAt: before.deletedAt,
        },
      })
    }
    expect(db.getProject(project.id)).toBeNull()
    expect(db.getNote(untouched.id)).toEqual(untouched)
  } finally {
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('rolls back bulk history insertion when the membership update fails', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-project-rollback-'))
  const db = new StrataDatabase(directory)
  let raw: Database.Database | undefined
  try {
    const project = db.createProject('Preserved project')
    const note = db.createNote({ content: '# Preserved', projectId: project.id })
    raw = new Database(path.join(directory, 'data/strata.sqlite'))
    raw.exec(
      "CREATE TRIGGER prevent_project_clear BEFORE UPDATE OF project_id ON notes WHEN new.project_id IS NULL BEGIN SELECT RAISE(ABORT,'fixture membership failure'); END",
    )
    expect(() => db.deleteProject(project.id)).toThrow('fixture membership failure')
    expect(db.getProject(project.id)).toEqual(project)
    expect(db.getNote(note.id)).toEqual(note)
    expect(db.listRevisions(note.id)).toHaveLength(1)
  } finally {
    raw?.close()
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
