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
	aiEditMode: z.enum(['read_only', 'confirm', 'auto_apply']).optional(),
	// AI provider settings
	aiRoutingMode: z.enum(['premium_only', 'cheap_only', 'auto', 'ask_each_time']).optional(),
	aiCheapProvider: z.string().trim().min(1).max(60).optional(),
	aiCheapModel: z.string().trim().max(120).optional(),
	aiPremiumProvider: z.string().trim().min(1).max(60).optional(),
	aiPremiumModel: z.string().trim().max(120).optional(),
	aiDeepseekApiKey: z.string().max(2048).optional(),
	aiKimiApiKey: z.string().max(2048).optional(),
	aiOpenrouterApiKey: z.string().max(2048).optional(),
	aiCustomApiKey: z.string().max(2048).optional(),
	aiCustomBaseUrl: z.string().max(512).optional(),
	aiShowRoutingDecisions: z.boolean().optional(),
	aiEnableRouteLogs: z.boolean().optional(),
	aiCheapConfidenceThreshold: z.number().min(0).max(1).optional(),
	aiPremiumFallbackThreshold: z.number().min(0).max(1).optional(),
	pinnedTags: z.array(z.string()).optional(),
})

export const registerSettingsHandlers = (db: StrataDatabase) => {
	ipcMain.handle(IPC_CHANNELS.settingsGet, () => db.getSettings())
	ipcMain.handle(IPC_CHANNELS.settingsSet, (_event, patch) => db.setSettings(settings_patch_schema.parse(patch)))
}
