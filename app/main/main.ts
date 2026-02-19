import path from 'node:path'
import { app, BrowserWindow, Menu, session } from 'electron'
import { fileURLToPath } from 'node:url'
import { StrataDatabase } from './db/index'
import { registerNotesHandlers } from './ipc/notesHandlers'
import { registerSettingsHandlers } from './ipc/settingsHandlers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let main_window: BrowserWindow | null = null

const createAppMenu = () => {
	if (!main_window) return
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: 'File',
			submenu: [
				{
					label: 'New Note',
					accelerator: 'CmdOrCtrl+N',
					click: () => main_window?.webContents.send('ui:command', 'new-note'),
				},
				{
					label: 'Delete Note',
					accelerator: 'CmdOrCtrl+Backspace',
					click: () => main_window?.webContents.send('ui:command', 'delete-note'),
				},
				{ type: 'separator' },
				{ role: 'quit' },
			],
		},
		{
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
					accelerator: 'CmdOrCtrl+F',
					click: () => main_window?.webContents.send('ui:command', 'focus-search'),
				},
				{
					label: 'Save',
					accelerator: 'CmdOrCtrl+S',
					click: () => main_window?.webContents.send('ui:command', 'save-note'),
				},
				{
					label: 'Toggle Star',
					accelerator: 'CmdOrCtrl+Shift+S',
					click: () => main_window?.webContents.send('ui:command', 'toggle-star'),
				},
				{
					label: 'Toggle Archive',
					accelerator: 'CmdOrCtrl+Shift+A',
					click: () => main_window?.webContents.send('ui:command', 'toggle-archive'),
				},
				{
					label: 'Toggle Filters Panel',
					accelerator: 'CmdOrCtrl+Shift+F',
					click: () => main_window?.webContents.send('ui:command', 'toggle-filters'),
				},
			],
		},
	]
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

	createAppMenu()

	if (process.env.VITE_DEV_SERVER_URL) {
		main_window.loadURL(process.env.VITE_DEV_SERVER_URL)
	} else {
		main_window.loadFile(path.join(__dirname, '../renderer/index.html'))
	}
}

app.whenReady().then(() => {
	setCspHeaders()

	const db = new StrataDatabase(app.getPath('userData'))
	registerNotesHandlers(db)
	registerSettingsHandlers(db)

	createWindow()
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})
