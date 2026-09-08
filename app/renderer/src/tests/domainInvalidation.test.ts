import { afterEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { KnowledgeService } from '@main/services/knowledgeService'
import { execute_tool_call } from '@main/ai/tools'
import { NO_CHANGED } from '@shared/changedDomains'
const cleanups: Array<() => void> = []
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn()),
)
const fixture = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-domains-'))
  const db = new StrataDatabase(directory)
  cleanups.push(() => {
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const notify = vi.fn()
  return { db, notify, service: new KnowledgeService(db, notify) }
}
it('distinguishes project, note, tag, graph and history dependencies', () => {
  const { db, service, notify } = fixture()
  const project = service.mutate({ op: 'create_project', name: 'Project' }) as { id: string }
  expect(notify).toHaveBeenLastCalledWith({ ...NO_CHANGED, projects: true })
  service.mutate({ op: 'rename_project', id: project.id, name: 'Renamed' })
  expect(notify).toHaveBeenLastCalledWith({ ...NO_CHANGED, projects: true, notes: true })
  const note = db.createNote({ content: 'Original', projectId: project.id })
  service.mutate({ op: 'update_note', id: note.id, payload: { expectedRevision: 1, content: 'Changed' } })
  expect(notify).toHaveBeenLastCalledWith({ ...NO_CHANGED, notes: true, history: true, links: true })
  service.mutate({ op: 'update_note', id: note.id, payload: { expectedRevision: 2, tags: ['new'] } })
  expect(notify).toHaveBeenLastCalledWith({
    ...NO_CHANGED,
    notes: true,
    history: true,
    links: true,
    tags: true,
  })
  service.mutate({ op: 'delete_project', id: project.id })
  expect(notify).toHaveBeenLastCalledWith({
    ...NO_CHANGED,
    projects: true,
    notes: true,
    history: true,
    links: true,
  })
  expect(db.getNote(note.id)?.projectId).toBeNull()
})
it('emits once after an atomic batch and never for rollback, dry-run or replay', () => {
  const { db, service, notify } = fixture()
  const note = db.createNote({ content: 'Original' })
  const operations = [
    { op: 'create_project', name: 'Batched' },
    { op: 'update_note', id: note.id, payload: { expectedRevision: 1, tags: ['batch'] } },
  ]
  service.batch({ operations, dryRun: true })
  expect(notify).not.toHaveBeenCalled()
  expect(() =>
    service.batch({
      operations: [
        ...operations,
        { op: 'update_note', id: note.id, payload: { expectedRevision: 1, content: 'stale' } },
      ],
    }),
  ).toThrow()
  expect(notify).not.toHaveBeenCalled()
  expect(db.listProjects()).toHaveLength(0)
  service.batch({ operations }, { key: 'domain-batch' })
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenLastCalledWith({
    notes: true,
    projects: true,
    tags: true,
    links: true,
    history: true,
  })
  service.batch({ operations }, { key: 'domain-batch' })
  expect(notify).toHaveBeenCalledTimes(1)
})
it('preserves project-only AI outcomes and only notifies approved proposals', () => {
  const { db, service, notify } = fixture()
  const call = (name: string) =>
    execute_tool_call(db, { id: 'call', name: 'create_project', argumentsJson: JSON.stringify({ name }) })
  const proposed = call('Proposed')
  expect(proposed.changed).toEqual(NO_CHANGED)
  expect(notify).not.toHaveBeenCalled()
  service.approve(proposed.proposalId!, true)
  expect(notify).toHaveBeenLastCalledWith({ ...NO_CHANGED, projects: true })
  db.setSettings({ aiEditMode: 'auto_apply' })
  expect(call('Immediate').changed).toEqual({ ...NO_CHANGED, projects: true })
})
