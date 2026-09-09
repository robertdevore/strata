import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { tsImport } from 'tsx/esm/api'
import Database from 'better-sqlite3'
import { _electron, expect } from '@playwright/test'

// Build the selected source first. Never launch an old application without the
// wrapper: historical versions do not honor STRATA_USER_DATA_DIR.
const source = path.resolve(process.env.STRATA_BENCH_SOURCE ?? process.cwd())
const count = Number(process.env.STRATA_BENCH_COUNT ?? 10000)
if (![100, 1000, 10000, 50000].includes(count)) throw new Error('Unsupported fixture size')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-renderer-bench-'))
const { StrataDatabase } = await tsImport(path.join(source, 'app/main/db/index.ts'), import.meta.url)
const id = (i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`
const marker = (i) => `uniquemarker${i}zebra`
const body = (i) =>
  `# Renderer ${i}\n\n${marker(i)}\n\n` +
  `## Local knowledge\n\n- Capture and review evidence.\n- Preserve recoverable history.\n\nA deterministic Markdown paragraph for renderer profiling.\n\n`.repeat(
    14,
  )
const hash = createHash('sha256')
const metrics = {}
let application
let raw
try {
  const db = new StrataDatabase(directory)
  db.close()
  raw = new Database(path.join(directory, 'data/strata.sqlite'))
  raw.pragma('foreign_keys = ON')
  raw.function('strata_content_hash', { deterministic: true }, (text) =>
    createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex'),
  )
  const modern = raw
    .prepare('PRAGMA table_info(notes)')
    .all()
    .some((row) => row.name === 'title')
  const insert = raw.prepare(
    `INSERT INTO notes(id,content,created_at,updated_at,tags${modern ? ',title,normalized_title' : ''}) VALUES(?,?,?,?,?${modern ? ',?,?' : ''})`,
  )
  raw.transaction(() => {
    for (let i = 0; i < count; i++) {
      const values = [
        id(i),
        body(i),
        '2026-09-08T00:00:00.000Z',
        '2026-09-08T00:00:00.000Z',
        JSON.stringify([`category${i % 100}`]),
      ]
      hash.update(JSON.stringify(values) + '\n')
      insert.run(...values, ...(modern ? [`Renderer ${i}`, `renderer ${i}`] : []))
    }
  })()
  raw.close()
  raw = undefined
  const reservation = net.createServer()
  await new Promise((resolve, reject) => {
    reservation.once('error', reject)
    reservation.listen(0, '127.0.0.1', resolve)
  })
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  const wrapper = path.join(directory, 'entry.cjs')
  fs.writeFileSync(
    wrapper,
    `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(directory)});\nimport(${JSON.stringify(pathToFileURL(path.join(source, 'dist/main/main.js')).href)});\n`,
  )
  const env = {
    ...process.env,
    STRATA_USER_DATA_DIR: directory,
    STRATA_API_HOST: '127.0.0.1',
    STRATA_API_PORT: String(port),
    STRATA_API_TOKEN: randomBytes(32).toString('hex'),
    STRATA_API_CREDENTIAL_FILE: path.join(directory, 'api-token'),
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.VITE_DEV_SERVER_URL
  const start = performance.now()
  application = await _electron.launch({ args: [wrapper], env, timeout: 120000 })
  expect(await application.evaluate(({ app }) => app.getPath('userData'))).toBe(directory)
  const page = await application.firstWindow()
  page.setDefaultTimeout(120000)
  const openSidebar = page.getByRole('button', { name: 'Open Sidebar', exact: true })
  await expect(openSidebar).toBeVisible({ timeout: 120000 })
  metrics.startupToHomeMs = performance.now() - start
  const sidebarStart = performance.now()
  await openSidebar.click()
  await expect(page.locator('.notes-list .note-row').first()).toBeVisible({ timeout: 120000 })
  metrics.openSidebarToFirstRowMs = performance.now() - sidebarStart
  const rowsAtStartup = await page.locator('.notes-list .note-row').count()
  const profiler = process.env.STRATA_RENDERER_PROFILE_PATH ? await page.context().newCDPSession(page) : null
  if (profiler) {
    await profiler.send('Profiler.enable')
    await profiler.send('Profiler.start')
  }
  const search = page.getByPlaceholder('Search...', { exact: true })
  const timings = { search: [], open: [], editorInput: [], saveIncludingDebounce: [], preview: [] }
  // Three distinct notes avoid measuring only the already-open editor/cache.
  for (const i of [51, 72, 93]) {
    let begin = performance.now()
    await search.fill(marker(i))
    await expect(page.locator('.notes-list .note-row')).toHaveCount(1, { timeout: 120000 })
    await expect(page.locator('.note-row-title').first()).toHaveText(`Renderer ${i}`)
    timings.search.push(performance.now() - begin)
    begin = performance.now()
    await page.locator('.notes-list .note-row').first().click()
    const editor = page.locator('.cm-content[contenteditable="true"]').first()
    await expect(editor).toContainText(marker(i))
    timings.open.push(performance.now() - begin)
    const draft = body(i) + `\nSaved benchmark edit ${i}.\n`
    begin = performance.now()
    await editor.fill(draft)
    await expect(editor).toContainText(`Saved benchmark edit ${i}.`)
    timings.editorInput.push(performance.now() - begin)
    await expect
      .poll(async () => (await page.evaluate((noteId) => window.strata.notes.get(noteId), id(i))).content, {
        timeout: 120000,
        intervals: [20, 50, 100],
      })
      .toContain(`Saved benchmark edit ${i}.`)
    timings.saveIncludingDebounce.push(performance.now() - begin)
    const preview = page.getByTitle('Preview', { exact: true })
    if ((await preview.getAttribute('class')).includes('chip-active')) await preview.click()
    begin = performance.now()
    await preview.click()
    await expect(page.locator('.preview-markdown').first()).toContainText(`Saved benchmark edit ${i}.`)
    timings.preview.push(performance.now() - begin)
    await preview.click()
  }
  for (const [name, values] of Object.entries(timings)) {
    values.sort((a, b) => a - b)
    metrics[name] = { medianMs: values[1], maxMs: values[2], samples: values.length }
  }
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop')
    fs.writeFileSync(process.env.STRATA_RENDERER_PROFILE_PATH, JSON.stringify(profile))
    await profiler.detach()
  }
  const processMemory = await application.evaluate(({ app }) =>
    app.getAppMetrics().map(({ type, memory }) => ({ type, memory })),
  )
  console.log(
    JSON.stringify(
      {
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
        harnessSha256: createHash('sha256')
          .update(fs.readFileSync(fileURLToPath(import.meta.url)))
          .digest('hex'),
        fixture: { count, sha256: hash.digest('hex'), rowsAtStartup },
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          cpu: os.cpus()[0]?.model,
        },
        metrics,
        processMemory,
      },
      null,
      2,
    ),
  )
} finally {
  raw?.close()
  if (application) await application.close()
  fs.rmSync(directory, { recursive: true, force: true })
}
