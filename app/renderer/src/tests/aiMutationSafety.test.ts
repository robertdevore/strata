import { NO_CHANGED } from '@shared/changedDomains'
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { execute_tool_call } from '@main/ai/tools'
import { KnowledgeService } from '@main/services/knowledgeService'
import { budgetHistory, runProviderToolLoop } from '@main/ai/toolLoop'
import type { AiProvider } from '@main/ai/types'
const cleanups: Array<() => void> = []
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn()),
)
const open = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-ai-safety-'))
  const db = new StrataDatabase(dir)
  cleanups.push(() => {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const call = (name: string, args: unknown) =>
    execute_tool_call(db, { id: 'call', name, argumentsJson: JSON.stringify(args) })
  return { db, call, service: new KnowledgeService(db) }
}
describe('AI mutation permissions', () => {
  it('rejects stale project renames and reorders while keeping the proposal pending', () => {
    const { db, service } = open()
    const project = db.createProject('Original')
    const rename = service.propose({ op: 'rename_project', id: project.id, name: 'AI name' })
    db.renameProject(project.id, 'Human name')
    expect(() => service.approve(rename.id, true)).toThrow('project changed')
    expect(db.getProject(project.id)?.name).toBe('Human name')
    expect(db.listProposals().map((item) => item.id)).toContain(rename.id)
    const reorder = service.propose({ op: 'reorder_projects', projectIds: [project.id] })
    const added = db.createProject('New project')
    expect(() => service.approve(reorder.id, true)).toThrow('project changed')
    expect(db.getProject(added.id)).not.toBeNull()
    const fresh = service.propose({ op: 'rename_project', id: project.id, name: 'Approved name' })
    service.approve(fresh.id, true)
    expect(db.getProject(project.id)?.name).toBe('Approved name')
  })
  it('checks project deletion against every affected note revision and membership', () => {
    const { db, service } = open()
    const project = db.createProject('Members')
    const note = db.createNote({ content: 'Original', projectId: project.id })
    const deleted = db.createNote({ content: 'Deleted member', projectId: project.id, archived: true })
    db.deleteNote(deleted.id)
    const proposal = service.propose({ op: 'delete_project', id: project.id })
    expect(proposal.before).toMatchObject({ id: project.id, affectedNotes: 2 })
    db.updateNote(note.id, { content: 'Human edit', expectedRevision: note.revision })
    expect(() => service.approve(proposal.id, true)).toThrow('project changed')
    const beforeAddition = service.propose({ op: 'delete_project', id: project.id })
    const added = db.createNote({ content: 'New member', projectId: project.id })
    expect(() => service.approve(beforeAddition.id, true)).toThrow('project changed')
    const fresh = service.propose({ op: 'delete_project', id: project.id })
    service.approve(fresh.id, true)
    expect(db.getProject(project.id)).toBeNull()
    expect(db.getNote(note.id)).toMatchObject({ content: 'Human edit', projectId: null })
    expect(db.getNote(added.id)?.projectId).toBeNull()
    expect(db.aiGetNoteById(deleted.id, true)?.projectId).toBeNull()
  })
  it('requires a fresh proposal for legacy project approvals without a precondition', () => {
    const { db, service } = open()
    const project = db.createProject('Legacy')
    const id = db.createProposal({
      operation: { op: 'delete_project', id: project.id },
      before: null,
      after: { deleted: true },
    })
    expect(() => service.approve(id, true)).toThrow('predates project checks')
    expect(db.getProject(project.id)).not.toBeNull()
    expect(service.approve(id, false)).toBeNull()
  })
  it('rejects pending proposals when their conversation is deleted and refuses late mutations', () => {
    const { db, service } = open()
    const thread = db.createAiThread('Removed', '')
    const other = db.createAiThread('Remaining', '')
    const saved = db.createNote({ content: 'Already saved' })
    const proposal = service.propose(
      { op: 'create_note', payload: { content: 'pending' } },
      { threadId: thread.id },
    )
    const retained = service.propose(
      { op: 'create_note', payload: { content: 'other' } },
      { threadId: other.id },
    )
    expect(db.deleteAiThread(thread.id)).toBe(true)
    expect(db.listProposals(thread.id)).toEqual([])
    expect(db.listProposals(other.id).map((item) => item.id)).toEqual([retained.id])
    expect(() => service.approve(proposal.id, true)).toThrow('Pending proposal not found')
    expect(() => service.propose({ op: 'create_note', payload: {} }, { threadId: thread.id })).toThrow(
      'Chat was deleted',
    )
    db.setSettings({ aiEditMode: 'auto_apply' })
    const late = execute_tool_call(
      db,
      { id: 'late', name: 'create_note', argumentsJson: '{"content":"late"}' },
      { threadId: thread.id },
    )
    expect(JSON.parse(late.output).error.code).toBe('CANCELLED')
    expect(db.listNotes().map((note) => note.id)).toEqual([saved.id])
  })
  it('records the project identity and order that a human must review', () => {
    const { db, service } = open()
    const first = db.createProject('Original project')
    const second = db.createProject('Second project')
    const rename = service.propose({ op: 'rename_project', id: first.id, name: 'Proposed name' })
    expect(rename.before).toEqual(first)
    expect(rename.after).toMatchObject({ id: first.id, name: 'Proposed name' })
    const removal = service.propose({ op: 'delete_project', id: first.id })
    expect(removal.before).toEqual({ ...first, affectedNotes: 0 })
    expect(db.getProject(first.id)).toEqual(first)
    const order = db.listProjects()
    const reorder = service.propose({ op: 'reorder_projects', projectIds: [second.id, first.id] })
    expect(reorder.before).toEqual(order)
    expect(db.listProjects()).toEqual(order)
  })
  it('filters pending proposals by conversation before applying the result limit', () => {
    const { db } = open()
    for (let index = 0; index < 55; index++)
      db.createProposal({ actor: { threadId: 'other' }, operation: { op: 'create_note' } })
    const id = db.createProposal({ actor: { threadId: 'selected' }, operation: { op: 'create_note' } })
    db.createProposal({ operation: { op: 'create_note' } })
    expect(db.listProposals('selected').map((item) => item.id)).toEqual([id])
    expect(db.listProposals('missing')).toEqual([])
    expect(db.listProposals('other')).toHaveLength(50)
    db.resolveProposal(id, false, () => null)
    expect(db.listProposals('selected')).toEqual([])
  })
  it('blocks every write domain in read-only mode', () => {
    const { db, call } = open()
    db.setSettings({ aiEditMode: 'read_only' })
    expect(JSON.parse(call('create_note', { content: 'no' }).output).error.code).toBe('READ_ONLY')
    expect(JSON.parse(call('create_project', { name: 'no' }).output).error.code).toBe('READ_ONLY')
    expect(db.listNotes()).toEqual([])
    expect(db.listProjects()).toEqual([])
  })
  it('proposes without writing and applies only after approval', () => {
    const { db, call, service } = open()
    const note = db.createNote({ content: '# Before' })
    const result = call('update_note', { note_id: note.id, expected_revision: 1, content: '# After' })
    expect(result.changed.notes).toBe(false)
    expect(result.proposalId).toBeTruthy()
    expect(db.getNote(note.id)?.content).toBe('# Before')
    service.approve(result.proposalId!, true)
    expect(db.getNote(note.id)?.content).toBe('# After')
    expect(db.listRevisions(note.id)[0].source).toBe('ai')
    expect(() => service.approve(result.proposalId!, true)).toThrow('not found')
  })
  it('rejects a proposal and conflicts on intervening human writes', () => {
    const { db, call, service } = open()
    const note = db.createNote({ content: 'before' })
    const rejected = call('create_note', { content: 'discard me' })
    service.approve(rejected.proposalId!, false)
    expect(db.listNotes()).toHaveLength(1)
    const pending = call('update_note', { note_id: note.id, expected_revision: 1, content: 'ai' })
    db.updateNote(note.id, { content: 'human' })
    expect(() => service.approve(pending.proposalId!, true)).toThrow('changed since')
    expect(db.getNote(note.id)?.content).toBe('human')
  })
  it('auto-applies transactional edits and validates malformed arguments', () => {
    const { db, call } = open()
    db.setSettings({ aiEditMode: 'auto_apply' })
    expect(call('create_note', { content: '# Applied' }).changed?.notes).toBe(true)
    expect(db.listNotes()).toHaveLength(1)
    for (const args of [
      { note_id: 'bad', expected_revision: 1, content: 'x' },
      { note_id: db.listNotes()[0].id, content: 'x' },
    ])
      expect(JSON.parse(call('update_note', args).output).error.code).toBe('VALIDATION_ERROR')
    expect(
      JSON.parse(execute_tool_call(db, { id: 'call', name: 'create_note', argumentsJson: '{' }).output).error
        .code,
    ).toBe('VALIDATION_ERROR')
  })
  it('does not arbitrarily resolve duplicate titles', () => {
    const { db, call } = open()
    db.createNote({ content: '# Duplicate' })
    db.createNote({ content: '# Duplicate' })
    expect(JSON.parse(call('get_note_by_title', { title: 'Duplicate' }).output).error.code).toBe(
      'AMBIGUOUS_TITLE',
    )
  })
})
describe('bounded provider loop', () => {
  it('runs retrieval tools for any provider, including a premium fallback', async () => {
    for (const providerId of ['cheap', 'premium']) {
      let turns = 0
      let executions = 0
      const provider: AiProvider = {
        providerId,
        kind: 'openai_chat_completions',
        sendTurn: async (input) => {
          turns++
          if (turns === 1)
            return { content: '', toolCalls: [{ id: 'read', name: 'get_note', argumentsJson: '{}' }] }
          expect(input.messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'read' })
          return { content: 'Answer', toolCalls: [] }
        },
      }
      const result = await runProviderToolLoop({
        provider,
        model: 'test',
        systemPrompt: 'test',
        messages: [],
        tools: [],
        execute: () => {
          executions++
          return { output: '{}', changed: { ...NO_CHANGED } }
        },
      })
      expect(result.content).toBe('Answer')
      expect(executions).toBe(1)
    }
  })
  it('bounds history and tool fanout', async () => {
    expect(
      budgetHistory([{ role: 'user', content: 'a'.repeat(30000) }]).reduce((n, m) => n + m.content.length, 0),
    ).toBe(24000)
    let executions = 0
    const provider: AiProvider = {
      providerId: 'test',
      kind: 'openai_chat_completions',
      sendTurn: async () => ({
        content: '',
        toolCalls: Array.from({ length: 21 }, (_, i) => ({ id: String(i), name: 'x', argumentsJson: '{}' })),
      }),
    }
    const result = await runProviderToolLoop({
      provider,
      model: 'test',
      systemPrompt: '',
      messages: [],
      tools: [],
      execute: () => {
        executions++
        return { output: '', changed: { ...NO_CHANGED } }
      },
    })
    expect(result.content).toContain('limit')
    expect(executions).toBe(0)
  })
})
