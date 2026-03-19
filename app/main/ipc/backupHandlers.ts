import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { BackupManager } from '../backup/backupManager'

export const registerBackupHandlers = (backup_manager: BackupManager) => {
	ipcMain.handle(IPC_CHANNELS.backupCreateNow, () => {
		return backup_manager.createBackupNow('manual')
	})

	ipcMain.handle(IPC_CHANNELS.backupOpenFolder, async () => {
		const error = await shell.openPath(backup_manager.getBackupDirectory())
		if (error) throw new Error(error)
		return true
	})
}
