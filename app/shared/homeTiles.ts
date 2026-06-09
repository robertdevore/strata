export const HOME_TILE_ACTIONS = [
	'new_note',
	'quick_open',
	'focus_search',
	'open_tags',
	'open_settings',
	'toggle_filters',
	'toggle_sidebar',
	'new_project',
] as const

export type HomeTileAction = typeof HOME_TILE_ACTIONS[number]

export interface HomeTileConfig {
	action: HomeTileAction
}

export interface HomeTileOption {
	action: HomeTileAction
	label: string
	description: string
}

export const HOME_TILE_OPTIONS: HomeTileOption[] = [
	{ action: 'new_note', label: 'New Note', description: 'Start a blank note and begin typing immediately.' },
	{ action: 'quick_open', label: 'Quick Open', description: 'Jump to an existing note with a fast search.' },
	{ action: 'focus_search', label: 'Search', description: 'Jump to the sidebar search field and find notes fast.' },
	{ action: 'open_tags', label: 'Browse Tags', description: 'Open the tag browser to organize and revisit topics.' },
	{ action: 'open_settings', label: 'Settings', description: 'Customize Strata and tune it to your workflow.' },
	{ action: 'toggle_filters', label: 'Toggle Filters', description: 'Show or hide the filters panel without leaving the editor.' },
	{ action: 'toggle_sidebar', label: 'Toggle Sidebar', description: 'Clear the workspace or bring the note list back.' },
	{ action: 'new_project', label: 'New Project', description: 'Create a project bucket before importing related notes.' },
]

export const DEFAULT_HOME_TILES: HomeTileConfig[] = [
	{ action: 'new_note' },
	{ action: 'quick_open' },
	{ action: 'open_settings' },
]

const HOME_TILE_ACTION_SET = new Set<string>(HOME_TILE_ACTIONS)

export const get_home_tile_option = (action: HomeTileAction): HomeTileOption => {
	return HOME_TILE_OPTIONS.find((option) => option.action === action) ?? HOME_TILE_OPTIONS[0]
}

export const normalize_home_tiles = (value: unknown): HomeTileConfig[] => {
	const items = Array.isArray(value) ? value : []

	return DEFAULT_HOME_TILES.map((fallback, index) => {
		const item = items[index]
		if (!item || 'object' !== typeof item) return fallback

		const action = (item as { action?: unknown }).action
		if ('string' !== typeof action || !HOME_TILE_ACTION_SET.has(action)) return fallback

		return { action: action as HomeTileAction }
	})
}
