import type { Settings } from '@shared/types'

export const settingsService = {
	get(): Promise<Settings> {
		return window.strata.settings.get()
	},
	set(patch: Partial<Settings>): Promise<Settings> {
		return window.strata.settings.set(patch)
	},
}
