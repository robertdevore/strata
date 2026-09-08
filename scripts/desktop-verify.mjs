import { pathToFileURL } from 'node:url'
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
  application = await _electron.launch({
    args: [process.cwd(), '--use-fake-device-for-media-stream'],
    env,
    timeout: 30000,
  })
  expect(await application.evaluate(({ app }) => app.getPath('userData'))).toBe(directory)
  const page = await application.firstWindow()
  page.on('requestfailed', (req) => console.error('Request failed:', req.url(), req.failure()))
  page.on('pageerror', (error) => console.error('Renderer error:', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text())
  })
  await expect(page.getByRole('button', { name: 'New Note', exact: true })).toBeVisible()
  await application.evaluate(({ app, session }) => {
    globalThis.__strataExportNetworkAttempts = 0
    globalThis.__strataExportPolicyEmbedded = false
    app.once('browser-window-created', (_event, window) => {
      window.webContents.once('did-finish-load', () => {
        const html = decodeURIComponent(window.webContents.getURL().split(',')[1] ?? '')
        globalThis.__strataExportPolicyEmbedded = html.startsWith(
          '<!doctype html><meta http-equiv="Content-Security-Policy"',
        )
      })
    })
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://127.0.0.1:32199/strata-export-test*'] },
      (_details, callback) => {
        globalThis.__strataExportNetworkAttempts++
        callback({ cancel: true })
      },
    )
  })
  try {
    const prefix = await page.evaluate(async () => {
      const pdf = await window.strata.exports.pdf({
        html: '<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"></head><body><h1>Isolated export</h1><img src="http://127.0.0.1:32199/strata-export-test-image"><style>body { background-image: url(http://127.0.0.1:32199/strata-export-test-css); }</style></body></html>',
      })
      return Array.from(pdf.slice(0, 5))
    })
    expect(prefix).toEqual([37, 80, 68, 70, 45]) // %PDF-
    expect(await application.evaluate(() => globalThis.__strataExportPolicyEmbedded)).toBe(true)
    expect(await application.evaluate(() => globalThis.__strataExportNetworkAttempts)).toBe(0)
  } finally {
    await application.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest(null))
  }
  expect(
    await application.evaluate(async ({ BrowserWindow }, preload) => {
      const auxiliary = new BrowserWindow({
        show: false,
        webPreferences: {
          preload,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      try {
        await auxiliary.loadURL('data:text/html,<title>Untrusted IPC fixture</title>')
        return await auxiliary.webContents.executeJavaScript(
          "window.strata.notes.page({}).then(() => 'unexpectedly allowed', error => error.message)",
        )
      } finally {
        auxiliary.destroy()
      }
    }, path.resolve('dist/preload/preload.mjs')),
  ).toContain('UNTRUSTED_IPC_SENDER')
  expect(
    await page.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const kinds = stream.getTracks().map((track) => track.kind)
      stream.getTracks().forEach((track) => track.stop())
      return kinds
    }),
  ).toEqual(['audio'])
  expect(
    await page.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        stream.getTracks().forEach((track) => track.stop())
        return 'unexpectedly allowed'
      } catch (error) {
        return error.name
      }
    }),
  ).toBe('NotAllowedError')
  expect(
    await page.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state),
  ).toBe('denied')
  await page.getByRole('button', { name: 'New Note', exact: true }).click()
  const editor = page.locator('.cm-content[contenteditable="true"]').first()
  await expect(editor).toBeVisible({ timeout: 20000 })
  const content = '# Desktop verification\n\nPersisted through the real editor and sandboxed IPC.'
  await editor.fill(content)
  let saved
  await expect
    .poll(
      async () => {
        const notes = await page.evaluate(async () => (await window.strata.notes.page({})).notes)
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
      fullList: typeof window.strata.notes.list,
      legacySummaries: typeof window.strata.notes.listSummaries,
    })),
  ).toEqual({
    require: 'undefined',
    process: 'undefined',
    shell: 'undefined',
    fullList: 'undefined',
    legacySummaries: 'undefined',
  })
  const distantId = await page.evaluate(async (savedId) => {
    const original = await window.strata.notes.get(savedId)
    await window.strata.notes.update(savedId, {
      tags: ['navigation-fixture'],
      expectedRevision: original.revision,
    })
    const distant = await window.strata.notes.create({
      content: '# Distant lookup target\n\nRetrieved beyond sidebar page.\n\n[[Desktop verification]]',
      tags: ['navigation-fixture'],
    })
    for (let index = 0; index < 105; index++) {
      await window.strata.notes.create({ content: `# Recent filler ${index}` })
    }
    const firstPage = await window.strata.notes.page({ limit: 100 })
    if (firstPage.notes.some((note) => note.id === distant.id))
      throw new Error('Fixture did not exceed first page')
    return distant.id
  }, saved.id)
  await page.reload()
  await page.getByRole('button', { name: /^Quick Open/ }).click()
  await page.getByRole('textbox', { name: 'Quick open notes' }).fill('Distant lookup target')
  await page.getByText('Distant lookup target', { exact: true }).click()
  await expect(page.locator('.cm-content').first()).toContainText('Retrieved beyond sidebar page.', {
    timeout: 20000,
  })
  expect(await page.evaluate((id) => window.strata.notes.get(id).then((note) => note.id), distantId)).toBe(
    distantId,
  )
  let unexpectedCreatePrompt = false
  page.on('dialog', async (dialog) => {
    unexpectedCreatePrompt = true
    await dialog.dismiss()
  })
  await page.getByTitle('Preview', { exact: true }).click()
  await page.getByRole('link', { name: 'Desktop verification', exact: true }).click()
  await expect(page.locator('.cm-content').first()).toContainText('Persisted through the real editor', {
    timeout: 20000,
  })
  expect(unexpectedCreatePrompt).toBe(false)
  await page.getByRole('button', { name: 'Open note actions', exact: true }).click()
  await page.getByTitle('Related Notes', { exact: true }).click()
  await page.locator('.related-notes-modal').getByText('Distant lookup target', { exact: true }).click()
  await expect(page.locator('.cm-content').first()).toContainText('Retrieved beyond sidebar page.', {
    timeout: 20000,
  })
  await page.evaluate(async () => {
    await window.strata.notes.create({ content: '# Ambiguous target\n\nChoice one' })
    return (await window.strata.notes.create({ content: '# Ambiguous target\n\nChoice two' })).id
  })
  const wikiEditor = page.locator('.cm-content[contenteditable="true"]').first()
  await wikiEditor.focus()
  await wikiEditor.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
  await wikiEditor.pressSequentially('[[Ambiguous target]]')
  await expect
    .poll(async () => (await page.evaluate((id) => window.strata.notes.get(id), distantId)).content, {
      timeout: 15000,
    })
    .toContain('[[Ambiguous target]]')

  const previewButton = page.getByTitle('Preview', { exact: true })
  if (!(await previewButton.getAttribute('class')).includes('chip-active')) await previewButton.click()
  await page.getByRole('link', { name: 'Ambiguous target', exact: true }).click()
  const choices = page.getByRole('region', { name: 'Choose wiki-link target' })
  await expect(choices).toBeVisible()
  await choices.getByRole('button', { name: /Choice two/ }).click()
  await expect(page.locator('.cm-content').first()).toContainText('Choice two', { timeout: 20000 })
  expect(unexpectedCreatePrompt).toBe(false)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+o' : 'Control+o')
  await page.getByRole('textbox', { name: 'Quick open notes' }).fill('Desktop verification')
  await page.locator('.palette-item-title').filter({ hasText: 'Desktop verification' }).click()
  await page.locator('.tab-item').filter({ hasText: 'Desktop verification' }).click({ button: 'right' })
  await page.getByRole('button', { name: 'Pin to Split View', exact: true }).click()
  await page.locator('.tab-item').filter({ hasText: 'Distant lookup target' }).click()
  const panes = page.locator('.split-pane')
  await expect(panes).toHaveCount(2)
  const pinnedPane = panes.first()
  const activePane = panes.last()
  await expect(pinnedPane.locator('.cm-content')).toContainText('Persisted through the real editor')
  // An independent IPC writer changes storage without updating the editor's loaded revision.
  await page.evaluate(async (id) => {
    const latest = await window.strata.notes.get(id)
    await window.strata.notes.update(id, {
      content: '# Desktop verification\n\nExternal update',
      expectedRevision: latest.revision,
    })
  }, saved.id)
  await pinnedPane.locator('.cm-content[contenteditable="true"]').fill('Preserved pinned draft')
  await expect(pinnedPane.getByRole('alert')).toContainText('Your draft is preserved')
  await expect(activePane.getByRole('alert')).toHaveCount(0)
  await activePane.locator('.cm-content[contenteditable="true"]').fill('Another pane saved')
  await expect
    .poll(async () => (await page.evaluate((id) => window.strata.notes.get(id), distantId)).content)
    .toContain('Another pane saved')
  await expect(activePane.getByRole('status')).toContainText('Saved')
  await expect(pinnedPane.getByRole('alert')).toContainText('Your draft is preserved')
  expect((await page.evaluate((id) => window.strata.notes.get(id), saved.id)).content).toContain(
    'External update',
  )
  await page.locator('.tab-item-pinned').getByTitle('Close Tab').click()
  await expect(page.getByText('Could not close this tab. Your draft is preserved.')).toBeVisible()
  await expect(page.locator('.tab-item-pinned')).toHaveCount(1)
  await expect(pinnedPane.locator('.cm-content')).toContainText('Preserved pinned draft')
  await pinnedPane.getByRole('button', { name: 'Save draft as new note and reload', exact: true }).click()
  await expect(pinnedPane.getByRole('alert')).toHaveCount(0)
  await expect(pinnedPane.locator('.cm-content')).toContainText('External update')
  const recovered = await page.evaluate(async () =>
    (await window.strata.notes.page({ query: 'Preserved pinned draft' })).notes.filter((note) =>
      note.tags.includes('recovered-draft'),
    ),
  )
  expect(recovered).toHaveLength(1)
  expect((await page.evaluate((id) => window.strata.notes.get(id), recovered[0].id)).content).toContain(
    'Preserved pinned draft',
  )
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /script-src 'self'/,
  )
  await page.evaluate(() => {
    window.__strataCspViolations = []
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__strataCspViolations.push(event.violatedDirective),
    )
    const script = document.createElement('script')
    script.textContent = 'window.__strataInlineExecuted = true'
    document.head.append(script)
  })
  await expect
    .poll(() =>
      page.evaluate(() => window.__strataCspViolations.some((value) => value.startsWith('script-src'))),
    )
    .toBe(true)
  expect(await page.evaluate(() => window.__strataInlineExecuted)).toBeUndefined()
  const originalUrl = page.url()
  await application.evaluate(({ BrowserWindow }) => {
    globalThis.__strataNavigationChecks = []
    BrowserWindow.getAllWindows()[0].webContents.on('will-navigate', (event) =>
      globalThis.__strataNavigationChecks.push(event.defaultPrevented),
    )
  })
  const deniedFile = path.join(directory, 'denied-navigation.html')
  await fs.writeFile(deniedFile, '<h1>This must not load</h1>')
  await page.evaluate((url) => {
    window.location.assign(url)
  }, pathToFileURL(deniedFile).href)
  await expect.poll(() => application.evaluate(() => globalThis.__strataNavigationChecks)).toEqual([true])
  expect(page.url()).toBe(originalUrl)
  expect(await page.evaluate((url) => window.open(url) === null, pathToFileURL(deniedFile).href)).toBe(true)
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  const failureLogs = []
  page.on('console', (message) => failureLogs.push(message.text()))
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('private-runtime-fixture')
    }, 0)
  })
  await expect
    .poll(() => failureLogs.some((message) => message.includes('Global renderer error:')))
    .toBe(true)
  expect(failureLogs.join('\n')).not.toContain('private-runtime-fixture')
  console.log(
    'Desktop verified: editor autosave/history/reload, full-library and ambiguous-link navigation, split-pane conflicts, sandbox/CSP/navigation/permission/IPC boundaries, offline PDF generation, and sanitized renderer failures.',
  )
} finally {
  try {
    await application?.close()
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
