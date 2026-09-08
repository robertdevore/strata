import { _electron, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

// Every launch uses a disposable library and an ephemeral authenticated API port.
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-desktop-'))
let application
try {
  const env = {
    ...process.env,
    STRATA_USER_DATA_DIR: directory,
    STRATA_API_PORT: '0',
    STRATA_API_TOKEN: randomBytes(32).toString('hex'),
    STRATA_API_CREDENTIAL_FILE: path.join(directory, 'api-token'),
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.VITE_DEV_SERVER_URL
  application = await _electron.launch({ args: [process.cwd()], env, timeout: 30000 })
  expect(await application.evaluate(({ app }) => app.getPath('userData'))).toBe(directory)
  const page = await application.firstWindow()
  page.on('requestfailed', (req) => console.error('Request failed:', req.url(), req.failure()))
  page.on('pageerror', (error) => console.error('Renderer error:', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text())
  })
  await expect(page.getByRole('button', { name: 'New Note', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New Note', exact: true }).click()
  const editor = page.locator('.cm-content[contenteditable="true"]').first()
  await expect(editor).toBeVisible({ timeout: 20000 })
  const content = '# Desktop verification\n\nPersisted through the real editor and sandboxed IPC.'
  await editor.fill(content)
  let saved
  await expect
    .poll(
      async () => {
        const notes = await page.evaluate(() => window.strata.notes.list({}))
        saved = notes.find((note) => note.content === content)
        return Boolean(saved)
      },
      { timeout: 15000 },
    )
    .toBe(true)
  const firstRevision = saved.revision
  await editor.fill(content + '\n\nSecond revision.')
  await expect
    .poll(async () => (await page.evaluate((id) => window.strata.notes.get(id), saved.id)).revision, {
      timeout: 15000,
    })
    .toBeGreaterThan(firstRevision)
  const history = await page.evaluate((id) => window.strata.notes.history(id), saved.id)
  expect(history.some((item) => item.revision === firstRevision)).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Open Sidebar', exact: true }).click()
  await page.getByText('Desktop verification', { exact: true }).first().click()
  await expect(page.locator('.cm-content').first()).toContainText('Second revision.', { timeout: 20000 })
  await page.getByText('Note revision history', { exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`^Revision ${firstRevision} ·`) }).click()
  await page.getByRole('button', { name: `Restore revision ${firstRevision}`, exact: true }).click()
  await expect
    .poll(async () => (await page.evaluate((id) => window.strata.notes.get(id), saved.id)).content)
    .toBe(content)
  await expect(page.locator('.cm-content').first()).not.toContainText('Second revision.')
  expect(
    await page.evaluate(() => ({
      require: typeof window.require,
      process: typeof window.process,
      shell: typeof window.strata.shell,
    })),
  ).toEqual({ require: 'undefined', process: 'undefined', shell: 'undefined' })
  console.log(
    'Desktop verified: real editor autosave, history restore, reload persistence, and sandboxed preload.',
  )
} finally {
  try {
    await application?.close()
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
