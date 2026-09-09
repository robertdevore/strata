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
  let page = await application.firstWindow()
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
  await wikiEditor.pressSequentially('[[Desktop ver')
  await page.getByRole('option', { name: /Desktop verification/ }).click()
  await expect(wikiEditor).toContainText('[[Desktop verification]]')
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
  // A committed independent write invalidates an already-dirty editor.
  await pinnedPane.locator('.cm-content[contenteditable="true"]').fill('Preserved pinned draft')
  await page.evaluate(async (id) => {
    const latest = await window.strata.notes.get(id)
    await window.strata.notes.update(id, {
      content: '# Desktop verification\n\nExternal update',
      expectedRevision: latest.revision,
    })
  }, saved.id)
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
  await application.evaluate(({ app, dialog }) => {
    globalThis.__strataClosePrompts = 0
    dialog.showMessageBox = async () => {
      globalThis.__strataClosePrompts++
      return { response: 0, checkboxChecked: false }
    }
    app.quit()
  })
  await expect.poll(() => application.evaluate(() => globalThis.__strataClosePrompts)).toBe(1)
  await expect.poll(() => page.evaluate(() => document.body.inert)).toBe(false)
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
  await activePane.getByTitle('Preview', { exact: true }).click()
  const linkSource = await page.evaluate(() =>
    window.strata.notes.create({ content: '# Invalidation source\n\n[[Distant lookup target]]' }),
  )
  await expect(activePane.locator('.backlinks-toggle').filter({ hasText: '1 Backlink' })).toBeVisible()
  await page.evaluate(
    (note) =>
      window.strata.notes.update(note.id, {
        content: '# Invalidation source',
        expectedRevision: note.revision,
      }),
    linkSource,
  )
  await expect(activePane.locator('.backlinks-toggle').filter({ hasText: '1 Backlink' })).toHaveCount(0)
  await page.evaluate(async () => {
    window.__strataDomainEvents = []
    window.strata.onDataChanged((changed) => window.__strataDomainEvents.push(changed))
    await window.strata.projects.create({ name: 'Notification project' })
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__strataDomainEvents.some(
          (event) => event.projects && !event.notes && !event.tags && !event.links && !event.history,
        ),
      ),
    )
    .toBe(true)
  const pagedProject = await page.evaluate(async () => {
    const project = await window.strata.projects.create({ name: 'Paged project fixture' })
    for (let i = 0; i < 130; i++)
      await window.strata.notes.create({
        projectId: project.id,
        content: `# Paged note ${i}\n\npagedmarker${i}zebra`,
      })
    for (let i = 0; i < 110; i++)
      await window.strata.notes.create({ content: `# Newer unprojected fixture ${i}` })
    return project.id
  })
  const openSidebar = page.getByRole('button', { name: 'Open Sidebar', exact: true })
  if (await openSidebar.isVisible()) await openSidebar.click()
  const sidebarSearch = page.getByPlaceholder('Search...', { exact: true })
  await sidebarSearch.fill('')
  await page.getByLabel('Filter by project').selectOption(pagedProject)
  const projectBlock = page
    .locator('.project-block')
    .filter({ has: page.locator('.project-label').getByText('Paged project fixture', { exact: true }) })
  await expect(projectBlock.locator('.project-count')).toHaveText('130')
  await expect(projectBlock.locator('.project-note-row')).toHaveCount(6)
  await page.getByRole('button', { name: 'Load more notes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Load more notes', exact: true })).toHaveCount(0)
  await sidebarSearch.fill('pagedmarker0zebra')
  await expect(projectBlock.locator('.project-note-row')).toHaveCount(1)
  await expect(projectBlock.locator('.note-row-title')).toHaveText('Paged note 0')
  await sidebarSearch.fill('')
  await page.getByLabel('Filter by project').selectOption('')
  // Synthetic provider transport only: no requests reach a real AI service.
  await application.evaluate(() => {
    process.env.STRATA_OPENAI_API_KEY = 'synthetic-desktop-fixture-key'
    globalThis.__strataAiFixtureStarted = false
    globalThis.__strataAiFixtureAborted = false
    globalThis.fetch = async (url, init) => {
      if (String(url) !== 'https://api.openai.com/v1/responses')
        throw new Error('Unexpected fixture provider URL')
      if (init.headers.Authorization !== 'Bearer synthetic-desktop-fixture-key')
        throw new Error('Fixture environment credential was not used')
      globalThis.__strataAiFixtureStarted = true
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => {
            globalThis.__strataAiFixtureAborted = true
            reject(new Error('Synthetic request aborted'))
          },
          { once: true },
        )
      })
    }
  })
  await page.evaluate(() =>
    window.strata.settings.set({
      aiRoutingMode: 'premium_only',
      aiPremiumProvider: 'openai',
      aiPremiumModel: 'fixture-model',
    }),
  )
  await activePane.getByTitle('Open AI Chat', { exact: true }).click()
  await activePane.getByPlaceholder('Message Strata AI…').fill('Explain this note')
  await activePane.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect.poll(() => application.evaluate(() => globalThis.__strataAiFixtureStarted)).toBe(true)
  await activePane.getByRole('button', { name: 'Stop AI response', exact: true }).click()
  await expect.poll(() => application.evaluate(() => globalThis.__strataAiFixtureAborted)).toBe(true)
  await expect(
    activePane.getByText(/Request cancelled. Any changes already applied remain saved/),
  ).toBeVisible()
  await expect(activePane.getByRole('button', { name: 'Stop AI response', exact: true })).toHaveCount(0)
  await page.evaluate(() => window.strata.settings.set({ aiEditMode: 'confirm' }))
  await application.evaluate(() => {
    globalThis.__strataProposalTurn = 0
    globalThis.fetch = async (url, init) => {
      if (
        String(url) !== 'https://api.openai.com/v1/responses' ||
        init.headers.Authorization !== 'Bearer synthetic-desktop-fixture-key'
      )
        throw new Error('Unexpected fixture provider request')
      if (JSON.parse(init.body).model !== 'fixture-model')
        throw new Error('Per-message model selection was not honored')
      const initial = globalThis.__strataProposalTurn++ % 2 === 0
      return new Response(
        JSON.stringify(
          initial
            ? {
                output: [
                  {
                    type: 'function_call',
                    call_id: 'fixture-proposal',
                    name: 'create_note',
                    arguments: JSON.stringify({ content: '# Desktop approved proposal' }),
                  },
                ],
              }
            : { output_text: 'Done', output: [] },
        ),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }
  })
  await page.getByTitle('Settings', { exact: true }).first().click()
  await page.getByRole('button', { name: 'AI', exact: true }).click()
  await page
    .locator('.settings-tab-content label')
    .filter({ hasText: 'AI Mode' })
    .locator('select')
    .selectOption('ask_each_time')
  await page.getByRole('button', { name: 'Close settings', exact: true }).click()
  const proposalNotes = () =>
    page.evaluate(() => window.strata.notes.page({ query: 'Desktop approved proposal' }))
  for (const action of ['Reject', 'Approve edit']) {
    await activePane.getByPlaceholder('Message Strata AI…').fill('Create the proposed fixture note')
    await expect(activePane.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled()
    await activePane
      .getByLabel('Model for this message', { exact: true })
      .selectOption('openai::fixture-model')
    await activePane.getByRole('button', { name: 'Send message', exact: true }).click()
    const review = activePane.getByRole('region', { name: 'AI edit proposals' })
    await review.locator('summary').filter({ hasText: 'AI edit awaiting approval:' }).click()
    await expect(review.getByText('+ # Desktop approved proposal', { exact: true })).toBeVisible()
    expect((await proposalNotes()).notes).toHaveLength(0)
    await review.getByRole('button', { name: action, exact: true }).click()
    await expect(review.locator('summary').filter({ hasText: 'AI edit awaiting approval:' })).toHaveCount(0)
    await expect(review.getByRole('status')).toHaveText(
      action === 'Reject' ? 'Proposal rejected.' : 'Edit applied.',
    )
  }
  const approvedNotes = (await proposalNotes()).notes
  expect(approvedNotes).toHaveLength(1)
  expect(await page.evaluate((id) => window.strata.notes.history(id), approvedNotes[0].id)).toHaveLength(1)
  await activePane.getByPlaceholder('Message Strata AI…').fill('Prepare another note proposal')
  await activePane.getByLabel('Model for this message', { exact: true }).selectOption('openai::fixture-model')
  await activePane.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(activePane.getByText('AI edit awaiting approval: create note', { exact: true })).toBeVisible()
  const pendingChat = await page.evaluate(async () => {
    for (const entry of await window.strata.ai.listThreads()) {
      const pending = await window.strata.ai.listProposals(entry.thread.id)
      if (pending.length) return { threadId: entry.thread.id, proposalId: pending[0].id }
    }
    throw new Error('Missing fixture proposal')
  })
  await activePane.getByRole('button', { name: 'Delete chat', exact: true }).click()
  await page
    .locator('.modal-card')
    .filter({ has: page.getByRole('heading', { name: 'Delete chat', exact: true }) })
    .getByRole('button', { name: 'Delete chat', exact: true })
    .click()
  await expect(activePane.getByText('AI edit awaiting approval: create note', { exact: true })).toHaveCount(0)
  expect(await page.evaluate((id) => window.strata.ai.listProposals(id), pendingChat.threadId)).toEqual([])
  expect(
    await page.evaluate(async (id) => {
      try {
        await window.strata.ai.resolveProposal(id, true)
        return true
      } catch {
        return false
      }
    }, pendingChat.proposalId),
  ).toBe(false)
  expect((await proposalNotes()).notes).toHaveLength(1)
  await activePane.getByTitle('Open AI Chat', { exact: true }).click()
  // Close immediately after input, before the debounce can save it.
  await activePane.locator('.cm-content[contenteditable="true"]').fill('Saved while quitting')
  await application.close()
  application = undefined
  application = await _electron.launch({
    args: [process.cwd(), '--use-fake-device-for-media-stream'],
    env,
    timeout: 30000,
  })
  const reopened = await application.firstWindow()
  await expect
    .poll(() => reopened.evaluate(() => Boolean(window.strata?.notes)), { timeout: 20000 })
    .toBe(true)
  expect((await reopened.evaluate((id) => window.strata.notes.get(id), distantId)).content).toContain(
    'Saved while quitting',
  )
  page = reopened
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
  // Reset Playwright's pending-navigation state after the intentionally denied file navigation.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'New Note', exact: true }).click()
  const restoreEditor = page.locator('.cm-content[contenteditable="true"]').last()
  await restoreEditor.fill('# Restore fixture\nOriginal backup content')
  let restoreNoteId
  await expect
    .poll(async () => {
      const result = await page.evaluate(() =>
        window.strata.notes.page({ query: 'Restore fixture', limit: 10 }),
      )
      restoreNoteId = result.notes.find((note) => note.title === 'Restore fixture')?.id
      return Boolean(restoreNoteId)
    })
    .toBe(true)
  const originalRestoreContent = (await page.evaluate((id) => window.strata.notes.get(id), restoreNoteId))
    .content
  const selectedBackup = await page.evaluate(() => window.strata.backups.createNow())
  const restoreAndRestart = async (backupName) => {
    // Fixture owns relaunch explicitly so no untracked Electron process survives the test.
    await application.evaluate(({ app }) => {
      app.relaunch = () => {}
    })
    const closed = application.waitForEvent('close', { timeout: 30000 })
    await Promise.all([
      closed,
      page
        .evaluate((name) => window.strata.backups.restoreNamed(name), backupName)
        .catch((error) => {
          if (!/closed|destroyed/i.test(error.message)) throw error
        }),
    ])
    application = undefined
    application = await _electron.launch({ args: [process.cwd()], env, timeout: 30000 })
    page = await application.firstWindow()
    await expect(page.getByRole('button', { name: 'New Note', exact: true })).toBeVisible({ timeout: 20000 })
  }
  // Trigger restore before autosave's debounce; the safety backup must include this draft.
  await restoreEditor.fill('# Restore fixture\nSaved immediately before restore')
  await restoreAndRestart(path.basename(selectedBackup.directory))
  expect((await page.evaluate((id) => window.strata.notes.get(id), restoreNoteId)).content).toBe(
    originalRestoreContent,
  )
  const recoveryPoints = []
  for (const name of await fs.readdir(path.join(directory, 'backups'))) {
    try {
      const manifest = JSON.parse(
        await fs.readFile(path.join(directory, 'backups', name, 'manifest.json'), 'utf8'),
      )
      if (manifest.reason === 'pre-restore') recoveryPoints.push(name)
    } catch {
      /* Imported snapshots do not have backup manifests. */
    }
  }
  expect(recoveryPoints).toHaveLength(1)
  await restoreAndRestart(recoveryPoints[0])
  expect((await page.evaluate((id) => window.strata.notes.get(id), restoreNoteId)).content).toMatch(
    /# Restore fixture\s+Saved immediately before restore$/,
  )
  console.log(
    'Desktop verified: editor autosave/history/reload, full-library and ambiguous-link navigation, split-pane conflicts, graceful quit persistence and backup restore draft recovery, domain and backlink refresh, AI Stop cancellation, per-message model choice, proposal rejection/approval and chat deletion, sandbox/CSP/navigation/permission/IPC boundaries, offline PDF generation, and sanitized renderer failures.',
  )
} finally {
  try {
    if (application) {
      // Fixture-only cleanup must not wait on a native dialog after a failed assertion.
      await application
        .evaluate(({ dialog }) => {
          dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
          dialog.showMessageBoxSync = () => 1
        })
        .catch(() => {})
      await application.close()
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
