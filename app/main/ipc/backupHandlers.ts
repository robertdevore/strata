import { handleTrustedIpc } from '../security/trustedIpc'
import { BrowserWindow, dialog, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { BackupManager, BackupRestorePreparation } from '../backup/backupManager'

export const registerBackupHandlers = (
  backup_manager: BackupManager,
  on_restore_prepared: (preparation: BackupRestorePreparation) => Promise<void>,
) => {
  let restoring = false
  const restore = async (sourcePath: string) => {
    if (restoring) throw new Error('A backup restore is already in progress.')
    restoring = true
    try {
      const preparation = await backup_manager.prepareRestore(sourcePath)
      await on_restore_prepared(preparation)
    } finally {
      restoring = false
    }
  }
  handleTrustedIpc(IPC_CHANNELS.backupCreateNow, () => {
    return backup_manager.createBackupNow('manual')
  })

  handleTrustedIpc(IPC_CHANNELS.backupListRecent, () => {
    return backup_manager.listRecentBackups()
  })

  handleTrustedIpc(IPC_CHANNELS.backupOpenFolder, async () => {
    const error = await shell.openPath(backup_manager.getBackupDirectory())
    if (error) throw new Error(error)
    return true
  })

  handleTrustedIpc(IPC_CHANNELS.backupRestoreSelect, async (event) => {
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

    await restore(result.filePaths[0])
    return { canceled: false }
  })

  handleTrustedIpc(IPC_CHANNELS.backupRestoreNamed, async (_event, payload: { name?: unknown }) => {
    if ('string' !== typeof payload?.name) throw new Error('Backup name is required.')
    await restore(backup_manager.getBackupPath(payload.name))
    return { canceled: false }
  })
}
