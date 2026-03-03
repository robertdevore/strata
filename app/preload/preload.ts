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
