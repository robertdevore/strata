import { expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { startNotesApiServer } from '@main/api/notesApiServer'
it('imports through one transaction and keeps single-file and folder dry runs read-only', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-cli-import-'))
  const db = new StrataDatabase(directory)
  const token = 'isolated-import-token-with-at-least-32-characters'
  const server = await startNotesApiServer(db, { port: 0, token })
  const run = (args: string[]) =>
    promisify(execFile)(
      process.execPath,
      [
        path.resolve('scripts/strata.mjs'),
        '--json',
        '--base-url',
        `http://127.0.0.1:${server.port}`,
        ...args,
      ],
      { cwd: directory, env: { ...process.env, STRATA_API_TOKEN: token }, timeout: 15000 },
    )
  try {
    const folder = path.join(directory, 'imported')
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'a.md'), '# A\n[[B]]')
    fs.writeFileSync(path.join(folder, 'b.md'), '# B')
    await run(['--dry-run', 'projects', 'import', path.join(folder, 'a.md')])
    await run(['--dry-run', 'projects', 'import', folder])
    expect(db.listNotes()).toEqual([])
    expect(db.listProjects()).toEqual([])
    expect(db.historyStats().revisions).toBe(0)
    const output = JSON.parse((await run(['--confirm', 'projects', 'import', folder])).stdout)
    expect(output.data.count).toBe(2)
    expect(output.data.notes.every((note: { content?: string }) => note.content === undefined)).toBe(true)
    expect(db.listNotes()).toHaveLength(2)
    expect(db.listRevisions(db.listNotes()[0].id)[0].source).toBe('import')
    const bad = path.join(directory, 'rollback')
    fs.mkdirSync(bad)
    fs.writeFileSync(path.join(bad, 'a.md'), '# Valid')
    fs.writeFileSync(path.join(bad, 'b.md'), 'x'.repeat(790000))
    await expect(run(['--confirm', 'projects', 'import', bad])).rejects.toThrow()
    expect(db.listNotes()).toHaveLength(2)
    expect(db.listProjects()).toHaveLength(1)
  } finally {
    await server.close()
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
}, 60000)
