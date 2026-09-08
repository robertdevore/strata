import type { ChangedDomains } from '../shared/changedDomains'
import { IPC_CHANNELS } from '../shared/ipc'
import { DraftCloseGuard } from './lifecycle/draftCloseGuard'
import { registerLifecycleHandlers } from './ipc/lifecycleHandlers'
import { PRODUCTION_CSP } from '../shared/contentSecurityPolicy'
import { debugRuntime, runtimeErrorCode } from '../shared/runtimeLogging'
import { EncryptedSecretStore } from './security/secretStore'
import { protectNavigation } from './security/navigation'
import { installPermissionPolicy } from './security/permissions'
import { configureTrustedIpc } from './security/trustedIpc'
import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow, dialog, Menu, session, shell, safeStorage } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Settings } from '../shared/types'
import { DEFAULT_HOTKEYS } from '../shared/hotkeys'
import { StrataDatabase } from './db/index'
import type { DatabaseRecoveryResult } from './db/recovery'
import { openStrataDatabaseWithRecovery } from './db/recovery'
import { BackupManager } from './backup/backupManager'
import type { BackupRestorePreparation } from './backup/backupManager'
import { registerNotesHandlers } from './ipc/notesHandlers'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { registerExportHandlers } from './ipc/exportHandlers'
import { registerAiHandlers } from './ipc/aiHandlers'
import { registerBackupHandlers } from './ipc/backupHandlers'
import { registerLinksHandlers } from './ipc/linksHandlers'
import { registerPublishHandlers } from './ipc/publishHandlers'
import { registerProjectsHandlers } from './ipc/projectsHandlers'
import { startNotesApiServer } from './api/notesApiServer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Share an explicit library location with the standalone CLI, including migration/testing.
if (process.env.STRATA_USER_DATA_DIR?.trim()) {
  const directory = path.resolve(process.env.STRATA_USER_DATA_DIR.trim())
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  app.setPath('userData', directory)
}

let main_window: BrowserWindow | null = null
let notes_api_server: { close: () => Promise<void> } | null = null
let backup_manager: BackupManager | null = null
let current_settings: Settings | null = null
let db: StrataDatabase | null = null
let database_recovery: DatabaseRecoveryResult | null = null

const notifyDataChanged = (changed: ChangedDomains) => main_window?.webContents.send('data:changed', changed)

const draftCloseGuard = new DraftCloseGuard({
  requestSave: (requestId) => {
    if (!main_window || main_window.isDestroyed()) throw new Error('WINDOW_UNAVAILABLE')
    main_window.webContents.send(IPC_CHANNELS.lifecyclePrepareClose, requestId)
  },
  confirmDiscard: async () => {
    if (!main_window || main_window.isDestroyed()) return false
    const result = await dialog.showMessageBox(main_window, {
      type: 'warning',
      title: 'Unsaved Drafts',
      message: 'Some drafts have not been saved.',
      detail: 'Keep editing to resolve conflicts or save errors, or discard the unsaved drafts and close.',
      buttons: ['Keep Editing', 'Discard Drafts and Close'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    return result.response === 1
  },
  complete: (quit) => {
    if (quit) app.quit()
    else main_window?.close()
  },
  cancelled: () => main_window?.webContents.send(IPC_CHANNELS.lifecycleCloseCancelled),
})

const restore_prepared_database = async (preparation: BackupRestorePreparation): Promise<void> => {
  backup_manager?.stop()
  await notes_api_server?.close()
  notes_api_server = null
  db?.close()
  db = null
  current_settings = null
  backup_manager?.commitRestore(preparation)
  app.relaunch()
  app.exit(0)
}

const hotkey_to_electron_accelerator = (hotkey: string): string | undefined => {
  const value = hotkey.trim()
  if (!value) return undefined
  const tokens = value
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)
  if (0 === tokens.length) return undefined

  const key_token = tokens[tokens.length - 1].toLowerCase()
  const modifiers = new Set<string>()
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i].toLowerCase()
    if ('cmd' === token || 'command' === token || 'meta' === token || '⌘' === token)
      modifiers.add('CmdOrCtrl')
    if ('ctrl' === token || 'control' === token || '⌃' === token) modifiers.add('Ctrl')
    if ('shift' === token || '⇧' === token) modifiers.add('Shift')
    if ('alt' === token || 'option' === token || 'opt' === token || '⌥' === token) modifiers.add('Alt')
  }

  let key: string | null = null
  if ('backspace' === key_token || 'delete' === key_token || '⌫' === key_token) key = 'Backspace'
  if ('space' === key_token) key = 'Space'
  if ('[' === key_token || ']' === key_token) key = key_token
  if (!key && 1 === key_token.length) key = key_token.toUpperCase()
  if (!key) return undefined

  const parts = Array.from(modifiers)
  parts.push(key)
  return parts.join('+')
}

const resolve_hotkeys = (settings?: Settings) => ({
  ...DEFAULT_HOTKEYS,
  ...(settings?.hotkeys ?? {}),
})

const createAppMenu = (settings?: Settings) => {
  if (!main_window) return
  const hotkeys = resolve_hotkeys(settings)
  const is_mac = 'darwin' === process.platform
  const template: Electron.MenuItemConstructorOptions[] = []

  if (is_mac) {
    const app_submenu: Electron.MenuItemConstructorOptions[] = [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ]
    template.push({
      label: app.name,
      submenu: app_submenu,
    })
  }

  const file_submenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'New Note',
      accelerator: hotkey_to_electron_accelerator(hotkeys.newNote),
      click: () => main_window?.webContents.send('ui:command', 'new-note'),
    },
    {
      label: 'Delete Note',
      accelerator: hotkey_to_electron_accelerator(hotkeys.deleteNote),
      click: () => main_window?.webContents.send('ui:command', 'delete-note'),
    },
    { type: 'separator' },
  ]

  file_submenu.push(is_mac ? { role: 'close' } : { role: 'quit' })

  template.push({
    label: 'File',
    submenu: file_submenu,
  })

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Focus Search',
        accelerator: hotkey_to_electron_accelerator(hotkeys.findOrSearch),
        click: () => main_window?.webContents.send('ui:command', 'focus-search'),
      },
      {
        label: 'Save',
        accelerator: hotkey_to_electron_accelerator(hotkeys.saveNote),
        click: () => main_window?.webContents.send('ui:command', 'save-note'),
      },
      {
        label: 'Toggle Star',
        accelerator: hotkey_to_electron_accelerator(hotkeys.toggleStar),
        click: () => main_window?.webContents.send('ui:command', 'toggle-star'),
      },
      {
        label: 'Toggle Archive',
        accelerator: hotkey_to_electron_accelerator(hotkeys.toggleArchive),
        click: () => main_window?.webContents.send('ui:command', 'toggle-archive'),
      },
      {
        label: 'Toggle Filters Panel',
        accelerator: hotkey_to_electron_accelerator(hotkeys.toggleFilters),
        click: () => main_window?.webContents.send('ui:command', 'toggle-filters'),
      },
    ],
  })

  template.push({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  })

  const window_submenu: Electron.MenuItemConstructorOptions[] = [{ role: 'minimize' }, { role: 'zoom' }]

  if (is_mac) {
    window_submenu.push({ type: 'separator' }, { role: 'front' }, { role: 'window' })
  } else {
    window_submenu.push({ role: 'close' })
  }

  template.push({
    label: 'Window',
    submenu: window_submenu,
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const setCspHeaders = () => {
  const is_dev = Boolean(process.env.VITE_DEV_SERVER_URL)
  const csp = is_dev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*;"
    : PRODUCTION_CSP

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })
}

const createWindow = () => {
  const window_options: Electron.BrowserWindowConstructorOptions = {
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0E1113',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }

  if ('darwin' === process.platform) {
    window_options.titleBarStyle = 'hiddenInset'
  }

  draftCloseGuard.reset()
  main_window = new BrowserWindow(window_options)
  const window = main_window
  window.on('close', (event) => {
    void draftCloseGuard.intercept(event)
  })
  window.on('closed', () => {
    if (main_window === window) {
      main_window = null
      draftCloseGuard.reset()
    }
  })
  window.webContents.on('will-prevent-unload', (event) => {
    if (draftCloseGuard.approved) {
      event.preventDefault()
      return
    }
    const response = dialog.showMessageBoxSync(window, {
      type: 'warning',
      title: 'Unsaved Drafts',
      message: 'Reloading will discard unsaved drafts.',
      buttons: ['Keep Editing', 'Discard Drafts and Leave'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (response === 1) event.preventDefault()
  })
  protectNavigation(main_window.webContents, (url) => shell.openExternal(url))

  createAppMenu(current_settings ?? undefined)

  if (process.env.VITE_DEV_SERVER_URL) {
    main_window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    main_window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  if (database_recovery?.recovered && database_recovery.backupDir) {
    const backup_dir = database_recovery.backupDir
    const restored_from = database_recovery.restoredFromBackupPath
    main_window.webContents.once('did-finish-load', () => {
      void dialog.showMessageBox(main_window!, {
        type: 'warning',
        title: 'Strata Recovered Its Database',
        message: restored_from
          ? 'Strata found a damaged local database and restored the latest healthy backup.'
          : 'Strata found a damaged local database and started with a fresh one because no healthy backup was available.',
        detail: [
          `Damaged database files were preserved here:\n${backup_dir}`,
          restored_from ? `Restored backup:\n${restored_from}` : null,
        ]
          .filter(Boolean)
          .join('\n\n'),
      })
    })
  }
}

void app
  .whenReady()
  .then(async () => {
    debugRuntime('[strata-startup] app ready')
    setCspHeaders()
    const rendererUrl = process.env.VITE_DEV_SERVER_URL
      ? new URL(process.env.VITE_DEV_SERVER_URL).href
      : pathToFileURL(path.join(__dirname, '../renderer/index.html')).href
    configureTrustedIpc(() => main_window?.webContents ?? null, rendererUrl)
    installPermissionPolicy(session.defaultSession, () => main_window?.webContents ?? null, rendererUrl)

    const user_data_path = app.getPath('userData')
    debugRuntime('[strata-startup] opening database')
    try {
      database_recovery = await openStrataDatabaseWithRecovery(user_data_path)
      db = database_recovery.db
      db.attachSecretStore(new EncryptedSecretStore(path.join(user_data_path, 'credentials'), safeStorage))
    } catch (error) {
      console.error('[strata-startup] failed to open database', runtimeErrorCode(error))
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('Strata Could Not Start', `Strata could not open its local database.\n\n${message}`)
      app.quit()
      return
    }
    debugRuntime('[strata-startup] database open')
    current_settings = db.getSettings()
    debugRuntime('[strata-startup] settings loaded')
    const db_file_path = path.join(user_data_path, 'data', 'strata.sqlite')
    const backup_directory = process.env.VITE_DEV_SERVER_URL
      ? path.join(process.cwd(), 'backups')
      : path.join(user_data_path, 'backups')

    backup_manager = new BackupManager({
      dbFilePath: db_file_path,
      backupDir: backup_directory,
      getSettings: () => db!.getSettings(),
      backupDatabase: (destination_path) => db!.backupTo(destination_path),
      onAutoBackupCreated: (created_at) => {
        db!.setSettings({ lastAutoBackupAt: created_at })
      },
    })
    debugRuntime('[strata-startup] backup manager ready')

    registerLifecycleHandlers(draftCloseGuard)
    registerNotesHandlers(db, notifyDataChanged)
    registerSettingsHandlers(db, (settings) => {
      current_settings = settings
      createAppMenu(current_settings)
    })
    registerExportHandlers()
    registerAiHandlers(db, notifyDataChanged)
    registerBackupHandlers(backup_manager, restore_prepared_database)
    registerLinksHandlers(db, notifyDataChanged)
    registerPublishHandlers()
    registerProjectsHandlers(db, notifyDataChanged)
    backup_manager.start()
    debugRuntime('[strata-startup] ipc registered')

    debugRuntime('[strata-startup] creating window')
    createWindow()
    debugRuntime('[strata-startup] window created')
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    void startNotesApiServer(db, {
      onDataChanged: notifyDataChanged,
    })
      .then((server) => {
        notes_api_server = server
      })
      .catch((error: unknown) => {
        console.error('[strata-api] Failed to start notes API server', runtimeErrorCode(error))
      })
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('Strata Could Not Start', message)
    app.quit()
  })

app.on('before-quit', (event) => {
  if (main_window && !main_window.isDestroyed()) void draftCloseGuard.intercept(event, true)
})

app.on('will-quit', () => {
  backup_manager?.stop()
  void notes_api_server?.close().catch((error) => {
    console.error('[strata-api] Failed to stop notes API server', runtimeErrorCode(error))
  })
  db?.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
