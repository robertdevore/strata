export type HotkeyAction =
	| 'quickOpen'
	| 'commandPalette'
	| 'newNote'
	| 'editNoteTags'
	| 'allTagsModal'
	| 'togglePreview'
	| 'findOrSearch'
	| 'toggleFilters'
	| 'saveNote'
	| 'toggleStar'
	| 'toggleArchive'
	| 'copyRichText'
	| 'deleteNote'
	| 'toggleSidebar'
	| 'relatedNotes'
	| 'navigateBack'
	| 'navigateForward'

export type HotkeysSettings = Record<HotkeyAction, string>

export const DEFAULT_HOTKEYS: HotkeysSettings = {
	quickOpen: 'Cmd+O',
	commandPalette: 'Cmd+K',
	newNote: 'Cmd+N',
	editNoteTags: 'Cmd+T',
	allTagsModal: 'Cmd+Shift+T',
	togglePreview: 'Cmd+P',
	findOrSearch: 'Cmd+F',
	toggleFilters: 'Cmd+Shift+F',
	saveNote: 'Cmd+S',
	toggleStar: 'Cmd+Shift+S',
	toggleArchive: 'Cmd+Shift+A',
	copyRichText: 'Cmd+Shift+C',
	deleteNote: 'Cmd+Backspace',
	toggleSidebar: 'Cmd+Shift+B',
	relatedNotes: 'Cmd+R',
	navigateBack: 'Cmd+[',
	navigateForward: 'Cmd+]',
}
