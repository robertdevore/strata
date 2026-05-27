import { contextBridge, ipcRenderer } from 'electron'
import type { StrataApi } from './api'
import { IPC_CHANNELS } from '../shared/ipc'

const api: StrataApi = {
	notes: {
		list: (filters) => ipcRenderer.invoke(IPC_CHANNELS.notesList, filters),
		get: (id) => ipcRenderer.invoke(IPC_CHANNELS.notesGet, { id }),
		create: () => ipcRenderer.invoke(IPC_CHANNELS.notesCreate),
		update: (id, patch) => ipcRenderer.invoke(IPC_CHANNELS.notesUpdate, { id, patch }),
		delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.notesDelete, { id }),
		restore: (id) => ipcRenderer.invoke(IPC_CHANNELS.notesRestore, { id }),
		archive: (id, archived) => ipcRenderer.invoke(IPC_CHANNELS.notesArchive, { id, archived }),
		star: (id, starred) => ipcRenderer.invoke(IPC_CHANNELS.notesStar, { id, starred }),
	},
	tags: {
		list: () => ipcRenderer.invoke(IPC_CHANNELS.tagsList),
	},
	settings: {
		get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
		set: (patch) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, patch),
	},
	exports: {
		pdf: (payload) => ipcRenderer.invoke(IPC_CHANNELS.exportPdf, payload),
		print: (payload) => ipcRenderer.invoke(IPC_CHANNELS.printHtml, payload),
	},
	backups: {
		createNow: () => ipcRenderer.invoke(IPC_CHANNELS.backupCreateNow),
		openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.backupOpenFolder),
	},
	ai: {
		listThreads: () => ipcRenderer.invoke(IPC_CHANNELS.aiThreadsList),
		deleteThread: (thread_id) => ipcRenderer.invoke(IPC_CHANNELS.aiThreadDelete, { threadId: thread_id }),
		listMessages: (thread_id) => ipcRenderer.invoke(IPC_CHANNELS.aiMessagesList, { threadId: thread_id }),
		sendMessage: (payload) => ipcRenderer.invoke(IPC_CHANNELS.aiSendMessage, payload),
		searchChats: (query) => ipcRenderer.invoke(IPC_CHANNELS.aiSearchChats, { query }),
		transcribeAudio: (payload) => ipcRenderer.invoke(IPC_CHANNELS.aiTranscribeAudio, payload),
		listEdits: (noteId) => ipcRenderer.invoke(IPC_CHANNELS.aiEditsList, { noteId }),
		revertEdit: (editId) => ipcRenderer.invoke(IPC_CHANNELS.aiEditsRevert, { editId }),
	},
	links: {
		backlinks: (note_id) => ipcRenderer.invoke(IPC_CHANNELS.linksBacklinks, { id: note_id }),
		resolveTarget: (raw_target) => ipcRenderer.invoke(IPC_CHANNELS.linksResolveTarget, { rawTarget: raw_target }),
		createMissingNote: (title) => ipcRenderer.invoke(IPC_CHANNELS.linksCreateMissingNote, { title }),
		relatedNotes: (note_id) => ipcRenderer.invoke(IPC_CHANNELS.linksRelatedNotes, { id: note_id }),
	},
	publish: {
		selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.dialogSelectFolder),
		htmlFile: (payload) => ipcRenderer.invoke(IPC_CHANNELS.publishHtmlFile, payload),
	},
	shell: {
		run: (payload) => ipcRenderer.invoke(IPC_CHANNELS.shellRun, payload),
	},
	onCommand: (listener) => {
		const wrapped = (_event: Electron.IpcRendererEvent, command: string) => listener(command)
		ipcRenderer.on('ui:command', wrapped)
		return () => ipcRenderer.removeListener('ui:command', wrapped)
	},
	onNotesChanged: (listener) => {
		const wrapped = () => listener()
		ipcRenderer.on('notes:changed', wrapped)
		return () => ipcRenderer.removeListener('notes:changed', wrapped)
	},
}

contextBridge.exposeInMainWorld('strata', api)
