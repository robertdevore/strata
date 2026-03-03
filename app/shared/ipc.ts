export const IPC_CHANNELS = {
	notesList: 'notes:list',
	notesGet: 'notes:get',
	notesCreate: 'notes:create',
	notesUpdate: 'notes:update',
	notesDelete: 'notes:delete',
	notesRestore: 'notes:restore',
	notesArchive: 'notes:archive',
	notesStar: 'notes:star',
	tagsList: 'tags:list',
	settingsGet: 'settings:get',
	settingsSet: 'settings:set',
	exportPdf: 'export:pdf',
} as const
