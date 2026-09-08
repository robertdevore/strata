import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { tsImport } from 'tsx/esm/api'
import Database from 'better-sqlite3'

const exec = promisify(execFile)
const source = path.resolve(process.env.STRATA_BENCH_SOURCE ?? process.cwd())
const count = Number(process.env.STRATA_BENCH_COUNT ?? 10000)
if (![100, 1000, 10000, 50000].includes(count)) throw new Error('Use a supported synthetic fixture size')
const { StrataDatabase } = await tsImport(path.join(source, 'app/main/db/index.ts'), import.meta.url)
const { startNotesApiServer } = await tsImport(
  path.join(source, 'app/main/api/notesApiServer.ts'),
  import.meta.url,
)
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-controlled-'))
const filename = path.join(directory, 'data/strata.sqlite')
const id = (i, prefix = '00000000') => `${prefix}-0000-4000-8000-${i.toString(16).padStart(12, '0')}`
const stamp = '2026-09-08T00:00:00.000Z'
const project = (i) => id(i % 10 === 0 ? 1 + (i % 9) : 0, '10000000')
const targets = (i) =>
  i === 0
    ? Array.from({ length: Math.min(100, count - 1) }, (_, j) => j + 1)
    : [...new Set([0, (i + 1) % count, (i + 17) % count])].filter((n) => n !== i)
const content = (i) =>
  `# Topic ${i}\n\n${targets(i)
    .map((n) => `[[Topic ${n}]]`)
    .join(
      ' ',
    )}\n\n## Decisions\n\n- [ ] Review category${i % 100} evidence\n- Keep a recoverable revision.\n\n> Local context for café planning.\n\n\`\`\`text\nfixture ${i}\n\`\`\`\n\n` +
  `Knowledge category${i % 100}: capture, retrieve, review and revise item ${i}.\n\n`.repeat(12 + (i % 40))
const fixtureHash = createHash('sha256')
let db
let raw
let server
const metrics = {}
const payloads = {}
const measure = async (name, operation, samples = 7) => {
  globalThis.gc?.()
  await operation(-1)
  globalThis.gc?.()
  const times = []
  let value
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now()
    value = await operation(sample)
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  metrics[name] = { medianMs: times[Math.floor(times.length / 2)], maxMs: times.at(-1), samples }
  return value
}
try {
  db = new StrataDatabase(directory)
  db.close()
  db = undefined
  raw = new Database(filename)
  raw.pragma('foreign_keys = ON')
  raw.function('strata_content_hash', { deterministic: true }, (text) =>
    createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex'),
  )
  const columns = new Set(
    raw
      .prepare('PRAGMA table_info(notes)')
      .all()
      .map((row) => row.name),
  )
  const modern = columns.has('title')
  const insertProject = raw.prepare(
    'INSERT INTO projects(id,name,created_at,updated_at,sort_order) VALUES(?,?,?,?,?)',
  )
  const insertNote = raw.prepare(
    `INSERT INTO notes(id,content,created_at,updated_at,tags,project_id,archived${modern ? ',title,normalized_title' : ''}) VALUES(?,?,?,?,?,?,?${modern ? ',?,?' : ''})`,
  )
  const linkColumns = new Set(
    raw
      .prepare('PRAGMA table_info(note_links)')
      .all()
      .map((row) => row.name),
  )
  const normalizedLinks = linkColumns.has('normalized_target')
  const insertLink = raw.prepare(
    `INSERT INTO note_links(id,source_note_id,target_note_id,raw_target,created_at${normalizedLinks ? ',normalized_target' : ''}) VALUES(?,?,?,?,?${normalizedLinks ? ',?' : ''})`,
  )
  let links = 0
  raw.transaction(() => {
    for (let i = 0; i < 10; i++) insertProject.run(id(i, '10000000'), `Project ${i}`, stamp, stamp, i)
    for (let i = 0; i < count; i++) {
      const body = content(i)
      const tags = JSON.stringify([`category${i % 100}`, ...(i % 5 === 0 ? ['shared'] : [])])
      const archived = i > 0 && i % 17 === 0 ? 1 : 0
      const values = [id(i), body, stamp, stamp, tags, project(i), archived]
      fixtureHash.update(JSON.stringify(values) + '\n')
      insertNote.run(...values, ...(modern ? [`Topic ${i}`, `topic ${i}`] : []))
    }
    for (let i = 0; i < count; i++) {
      for (const target of targets(i)) {
        insertLink.run(
          id(links++, '20000000'),
          id(i),
          id(target),
          `Topic ${target}`,
          stamp,
          ...(normalizedLinks ? [`topic ${target}`] : []),
        )
      }
    }
  })()
  raw.close()
  raw = undefined
  const startupTimes = []
  for (let sample = -1; sample < 3; sample++) {
    const start = performance.now()
    db = new StrataDatabase(directory)
    if (sample >= 0) startupTimes.push(performance.now() - start)
    db.close()
    db = undefined
  }
  startupTimes.sort((a, b) => a - b)
  metrics.startup = { medianMs: startupTimes[1], maxMs: startupTimes[2], samples: 3 }
  db = new StrataDatabase(directory)
  process.env.STRATA_API_HOST = '127.0.0.1'
  process.env.STRATA_API_TOKEN = 'synthetic-controlled-benchmark-token-32-characters'
  const originalInfo = console.info
  console.info = (...args) => console.error(...args)
  try {
    server = await startNotesApiServer(db, { port: 0, token: process.env.STRATA_API_TOKEN })
  } finally {
    console.info = originalInfo
  }
  const related = async (noteId) => {
    const response = await fetch(`http://127.0.0.1:${server.port}/notes/${noteId}/related`, {
      headers: { 'X-Strata-Token': process.env.STRATA_API_TOKEN },
    })
    if (!response.ok) throw new Error(`Related benchmark failed: ${response.status}`)
    return response.json()
  }
  const list = () =>
    db.listSummaryPage ? db.listSummaryPage({ limit: 100 }).notes : db.listNotes().slice(0, 100)
  await measure('get', () => db.getNote(id(51)))
  const titleMatch = await measure('titleLookup', () => db.resolveLinkTarget('Topic 51'))
  if (titleMatch?.id !== id(51)) throw new Error('Title resolver mismatch')
  const summaries = await measure('list100', list)
  if (summaries.length !== 100) throw new Error('List workload lost records')
  const found = await measure('search10', () => db.aiSearchNotes('category42', 10))
  if (found.length !== Math.min(10, Math.ceil((count - 42) / 100))) throw new Error('Search fixture mismatch')
  await measure('tags', () => db.listTags())
  await measure('tagList100', () =>
    db.listSummaryPage
      ? db.listSummaryPage({ tag: 'category42', limit: 100 }).notes
      : db.listNotes({ tag: 'category42' }).slice(0, 100),
  )
  const backlinks = await measure('backlinksHub', () => db.getBacklinks(id(0)))
  const hubRelated = await measure('relatedHubHttp', () => related(id(0)))
  const projectRelated = await measure('relatedLargeProjectHttp', () => related(id(51)))
  await measure('projects', () => db.listProjects())
  await measure('projectRename', (sample) => db.renameProject(id(0, '10000000'), `Project renamed ${sample}`))
  await measure('updateLinks', (sample) =>
    db.updateNote(id(51), { content: content(51) + `\nEdit sample ${sample}` }),
  )
  await measure(
    'renameHub',
    (sample) =>
      db.updateNote(id(0), {
        content: content(0).replace('# Topic 0\n', `# ${sample % 2 ? 'Renamed hub' : 'Topic 0'}\n`),
      }),
    4,
  )
  await measure(
    'backup',
    async (sample) => {
      const destination = path.join(directory, `snapshot-${sample}.sqlite`)
      await db.backupTo(destination)
      fs.rmSync(destination)
    },
    3,
  )
  // Same SQL substring operation on both schemas, alongside each version's application search.
  raw = new Database(filename, { readonly: true })
  const like = raw.prepare(
    'SELECT id,substr(content,1,200) AS snippet FROM notes WHERE deleted_at IS NULL AND content LIKE ? ORDER BY updated_at DESC,id DESC LIMIT 10',
  )
  await measure('sqlLike10Control', () => like.all('%category42%'))
  const projectPlan = raw
    .prepare(
      'EXPLAIN QUERY PLAN SELECT id FROM notes WHERE project_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50',
    )
    .all(id(0, '10000000'))
  raw.close()
  raw = undefined
  const launcher = fs.existsSync(path.join(source, 'scripts/strata.mjs'))
    ? [path.join(source, 'scripts/strata.mjs')]
    : [path.join(source, 'node_modules/tsx/dist/cli.mjs'), path.join(source, 'app/cli/index.ts')]
  for (const [name, args] of [
    ['health', ['health']],
    ['list50', ['notes', 'list', '--limit', '50']],
    ['search10', ['search', 'category42', '--limit', '10']],
  ]) {
    const result = await measure(
      `cli${name}`,
      async () => {
        const output = await exec(
          process.execPath,
          [...launcher, '--json', '--base-url', `http://127.0.0.1:${server.port}`, ...args],
          { cwd: directory, env: process.env, maxBuffer: 4 * 1024 * 1024, timeout: 30000 },
        )
        JSON.parse(output.stdout)
        return output.stdout
      },
      3,
    )
    payloads[name] = Buffer.byteLength(result)
  }
  await server.close()
  server = undefined
  const rssBeforeProjectDelete = process.memoryUsage().rss
  const deletionStart = performance.now()
  db.deleteProject(id(0, '10000000'))
  metrics.projectDeleteLarge = { medianMs: performance.now() - deletionStart, samples: 1 }
  if (db.getNote(id(51)).projectId !== null) throw new Error('Project deletion failed')
  console.log(
    JSON.stringify(
      {
        fixture: 'controlled-v1',
        count,
        links,
        fixtureSha256: fixtureHash.digest('hex'),
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
        harnessSha256: createHash('sha256')
          .update(fs.readFileSync(fileURLToPath(import.meta.url)))
          .digest('hex'),
        runtime: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          cpu: os.cpus()[0].model,
        },
        metrics,
        cliBytes: payloads,
        returned: {
          list: summaries.length,
          search: found.length,
          backlinks: backlinks.length,
          relatedHub: hubRelated.related.map((item) => item.note.id),
          relatedProject: projectRelated.related.map((item) => item.note.id),
        },
        projectPlan,
        rssBeforeProjectDelete,
        rssBytes: process.memoryUsage().rss,
      },
      null,
      2,
    ),
  )
} finally {
  await server?.close()
  raw?.close()
  db?.close()
  fs.rmSync(directory, { recursive: true, force: true })
}
