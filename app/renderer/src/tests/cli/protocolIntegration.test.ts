import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { startNotesApiServer } from '@main/api/notesApiServer'
const exec = promisify(execFile)
describe('CLI protocol integration', () => {
  it('discovers capabilities and executes safe idempotent batches from outside the checkout', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-cli-protocol-'))
    const db = new StrataDatabase(dir)
    const token = 'integration-test-token-with-at-least-32-characters'
    const server = await startNotesApiServer(db, { port: 0, token })
    const run = async (args: string[]) => {
      const output = await exec(
        process.execPath,
        [
          path.resolve('scripts/strata.mjs'),
          '--json',
          '--base-url',
          `http://127.0.0.1:${server.port}`,
          ...args,
        ],
        { cwd: dir, env: { ...process.env, STRATA_API_TOKEN: token }, maxBuffer: 1024 * 1024 },
      )
      return JSON.parse(output.stdout)
    }
    try {
      const capabilities = await run(['capabilities'])
      expect(capabilities.data.apiVersion).toBe(1)
      const file = path.join(dir, 'operations.json')
      fs.writeFileSync(
        file,
        JSON.stringify({ operations: [{ op: 'create_note', payload: { content: '# CLI batch' } }] }),
      )
      await run(['--dry-run', 'batch', '--file', file])
      expect(db.listNotes()).toEqual([])
      await run(['--confirm', 'batch', '--file', file, '--request-id', 'cli-retry'])
      await run(['--confirm', 'batch', '--file', file, '--request-id', 'cli-retry'])
      expect(db.listNotes()).toHaveLength(1)
      const note = db.listNotes()[0]
      await run(['--confirm', 'notes', 'update', note.id, '--content', '# Updated', '--if-revision', '1'])
      await expect(
        run(['--confirm', 'notes', 'update', note.id, '--content', '# Stale', '--if-revision', '1']),
      ).rejects.toThrow()
      expect(db.getNote(note.id)?.content).toBe('# Updated')
      expect((await run(['notes', 'list', '--fields', 'id,revision'])).data.notes).toEqual([
        { id: note.id, revision: 2 },
      ])
      expect((await run(['search', 'Updated', '--fields', 'title,revision'])).data.notes).toEqual([
        { title: 'Updated', revision: 2 },
      ])
      expect((await run(['search', 'Updated', '--ids-only'])).data.notes).toEqual([note.id])
      const pageCount = await run(['search', 'Updated', '--count'])
      expect(pageCount.data).toMatchObject({ count: 1, nextCursor: null })
      expect(pageCount.data.notes).toBeUndefined()
      expect((await run(['search', 'Updated', '--full'])).data.notes[0].content).toBe('# Updated')
      expect(await run(['notes', 'get', note.id, '--revision'])).toBe(2)
      for (const args of [
        ['notes', 'list', '--limit', '3oops'],
        ['search', 'Updated', '--fields', 'typo'],
      ]) {
        await expect(run(args)).rejects.toMatchObject({ code: 2 })
      }

      const search = await run(['agent', 'context', 'search', 'Updated'])
      expect(search.data.notes[0]).toMatchObject({ title: 'Updated', revision: 2 })
      const full = await run(['agent', 'context', 'search', 'Updated', '--full'])
      expect(full.data.notes[0].content).toBe('# Updated')
      const captureArgs = [
        'agent',
        'decision',
        '# Durable decision',
        '--source',
        'repository:test',
        '--session',
        'session-1',
      ]
      const capture = await run(captureArgs)
      const retry = await run(captureArgs)
      expect(retry.data.duplicate).toBe(true)
      expect(retry.data.noteId).toBe(capture.data.noteId)
      expect(db.getNote(capture.data.noteId)?.content).toContain('repository:test')
      expect(db.getNote(capture.data.noteId)?.tags).not.toContain('codex')
      const count = db.listNotes().length
      await run(['--dry-run', 'agent', 'capture', '# Dry capture'])
      expect(db.listNotes()).toHaveLength(count)
    } finally {
      await server.close()
      db.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 40000)
})
