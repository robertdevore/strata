import { ipcMain } from 'electron'
import { z } from 'zod'
import type { StrataDatabase } from '../db/index'
import { IPC_CHANNELS } from '../../shared/ipc'

const settings_patch_schema = z.object({
	theme: z.enum(['dark', 'light', 'system']).optional(),
	defaultView: z.enum(['all', 'starred']).optional(),
	confirmDelete: z.boolean().optional(),
	sortMode: z.enum(['updated_desc', 'created_desc', 'title_asc']).optional(),
	openAiApiKey: z.string().max(2048).optional(),
	openAiModel: z.string().trim().min(1).max(120).optional(),
	autoBackupFrequency: z.enum(['off', '12h', '24h', '168h']).optional(),
	lastAutoBackupAt: z.string().datetime().nullable().optional(),
})

export const registerSettingsHandlers = (db: StrataDatabase) => {
	ipcMain.handle(IPC_CHANNELS.settingsGet, () => db.getSettings())
	ipcMain.handle(IPC_CHANNELS.settingsSet, (_event, patch) => db.setSettings(settings_patch_schema.parse(patch)))
}
