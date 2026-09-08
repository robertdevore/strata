import { expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { startNotesApiServer } from '@main/api/notesApiServer'

it('reports complete project counts without fetching a page of notes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-project-counts-'))
  const db = new StrataDatabase(directory)
  const token = 'isolated-project-count-token-at-least-32-characters'
  let server: Awaited<ReturnType<typeof startNotesApiServer>> | undefined
  try {
    const large = db.createProject('Large project')
    const empty = db.createProject('Empty project')
    const small = db.createProject('Small project')
    for (let i = 0; i < 128; i++) {
      const note = db.createNote({ content: `# Entry ${i}`, projectId: large.id, archived: i >= 121 })
      if (i < 13) db.deleteNote(note.id)
    }
    for (let i = 0; i < 6; i++) db.createNote({ content: `# Small ${i}`, projectId: small.id })
    db.createNote({ content: '# Unassigned' })
    const page = vi.spyOn(db, 'listSummaryPage')
    server = await startNotesApiServer(db, { port: 0, token })
    const run = (mode: string) =>
      promisify(execFile)(
        process.execPath,
        [
          path.resolve('scripts/strata.mjs'),
          mode,
          '--base-url',
          `http://127.0.0.1:${server!.port}`,
          'projects',
          'list',
        ],
        { cwd: directory, env: { ...process.env, STRATA_API_TOKEN: token }, timeout: 15000 },
      )
    const result = JSON.parse((await run('--json')).stdout)
    expect(
      result.data.projects.map((project: { id: string; noteCount: number }) => [
        project.id,
        project.noteCount,
      ]),
    ).toEqual([
      [large.id, 115],
      [empty.id, 0],
      [small.id, 6],
    ])
    const pretty = (await run('--pretty')).stdout
    expect(pretty).toMatch(/Large project\s+115/)
    expect(pretty).toMatch(/Empty project\s+0/)
    expect(pretty).toMatch(/Small project\s+6/)
    expect(page).not.toHaveBeenCalled()
    expect(result.data.projects.every((project: Record<string, unknown>) => !('content' in project))).toBe(
      true,
    )
  } finally {
    await server?.close()
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
}, 60000)
