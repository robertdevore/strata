import path from 'node:path'
import { app, BrowserWindow, dialog, Menu, session } from 'electron'
import { fileURLToPath } from 'node:url'
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

let main_window: BrowserWindow | null = null
let notes_api_server: { close: () => Promise<void> } | null = null
let backup_manager: BackupManager | null = null
let current_settings: Settings | null = null
let db: StrataDatabase | null = null
let database_recovery: DatabaseRecoveryResult | null = null

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
	const tokens = value.split('+').map((token) => token.trim()).filter(Boolean)
	if (0 === tokens.length) return undefined

	const key_token = tokens[tokens.length - 1].toLowerCase()
	const modifiers = new Set<string>()
	for (let i = 0; i < tokens.length - 1; i++) {
		const token = tokens[i].toLowerCase()
		if ('cmd' === token || 'command' === token || 'meta' === token || '⌘' === token) modifiers.add('CmdOrCtrl')
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
		: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"

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

	main_window = new BrowserWindow(window_options)

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
				].filter(Boolean).join('\n\n'),
			})
		})
	}
}

void app.whenReady().then(async () => {
	console.info('[strata-startup] app ready')
	setCspHeaders()

	const user_data_path = app.getPath('userData')
	console.info(`[strata-startup] opening database at ${user_data_path}`)
	try {
		database_recovery = await openStrataDatabaseWithRecovery(user_data_path)
		db = database_recovery.db
	} catch (error) {
		console.error('[strata-startup] failed to open database', error)
		const message = error instanceof Error ? error.message : String(error)
		dialog.showErrorBox('Strata Could Not Start', `Strata could not open its local database.\n\n${message}`)
		app.quit()
		return
	}
	console.info('[strata-startup] database open')
	current_settings = db.getSettings()
	console.info('[strata-startup] settings loaded')
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
	console.info('[strata-startup] backup manager ready')

	registerNotesHandlers(db)
	registerSettingsHandlers(db, (settings) => {
		current_settings = settings
		createAppMenu(current_settings)
	})
	registerExportHandlers()
	registerAiHandlers(db, () => main_window?.webContents.send('notes:changed'))
	registerBackupHandlers(backup_manager, restore_prepared_database)
	registerLinksHandlers(db)
	registerPublishHandlers()
	registerProjectsHandlers(db, () => main_window?.webContents.send('notes:changed'))
	backup_manager.start()
	console.info('[strata-startup] ipc registered')

	console.info('[strata-startup] creating window')
	createWindow()
	console.info('[strata-startup] window created')
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})

	void startNotesApiServer(db, {
		onNotesChanged: () => main_window?.webContents.send('notes:changed'),
	}).then((server) => {
		notes_api_server = server
	}).catch((error: unknown) => {
		console.error('[strata-api] Failed to start notes API server', error)
	})
}).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error)
	dialog.showErrorBox('Strata Could Not Start', message)
	app.quit()
})

app.on('before-quit', () => {
	backup_manager?.stop()
	void notes_api_server?.close().catch((error) => {
		console.error('[strata-api] Failed to stop notes API server', error)
	})
	db?.close()
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})
