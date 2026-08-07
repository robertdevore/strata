import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { BackupManager, BackupRestorePreparation } from '../backup/backupManager'

export const registerBackupHandlers = (
	backup_manager: BackupManager,
	on_restore_prepared: (preparation: BackupRestorePreparation) => Promise<void>,
) => {
	ipcMain.handle(IPC_CHANNELS.backupCreateNow, () => {
		return backup_manager.createBackupNow('manual')
	})

	ipcMain.handle(IPC_CHANNELS.backupListRecent, () => {
		return backup_manager.listRecentBackups()
	})

	ipcMain.handle(IPC_CHANNELS.backupOpenFolder, async () => {
		const error = await shell.openPath(backup_manager.getBackupDirectory())
		if (error) throw new Error(error)
		return true
	})

	ipcMain.handle(IPC_CHANNELS.backupRestoreSelect, async (event) => {
		const parent_window = BrowserWindow.fromWebContents(event.sender) ?? undefined
		const options: Electron.OpenDialogOptions = {
			title: 'Select a Strata backup',
			properties: ['openFile', 'openDirectory'],
			filters: [{ name: 'SQLite backups', extensions: ['sqlite', 'db'] }],
		}
		const result = parent_window
			? await dialog.showOpenDialog(parent_window, options)
			: await dialog.showOpenDialog(options)
		if (result.canceled || !result.filePaths[0]) return { canceled: true }

		const preparation = await backup_manager.prepareRestore(result.filePaths[0])
		await on_restore_prepared(preparation)
		return { canceled: false }
	})

	ipcMain.handle(IPC_CHANNELS.backupRestoreNamed, async (_event, payload: { name?: unknown }) => {
		if ('string' !== typeof payload?.name) throw new Error('Backup name is required.')
		const preparation = await backup_manager.prepareRestore(backup_manager.getBackupPath(payload.name))
		await on_restore_prepared(preparation)
		return { canceled: false }
	})
}
