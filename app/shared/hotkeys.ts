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
	| 'toggleSettings'
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
	toggleStar: 'Cmd+D',
	toggleArchive: 'Cmd+Shift+A',
	copyRichText: 'Cmd+C',
	deleteNote: 'Cmd+Backspace',
	toggleSidebar: 'Cmd+Shift+B',
	toggleSettings: 'Cmd+Shift+S',
	relatedNotes: 'Cmd+R',
	navigateBack: 'Cmd+[',
	navigateForward: 'Cmd+]',
}
