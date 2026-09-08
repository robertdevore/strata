import type { ChangedDomains } from '../shared/changedDomains'
import { contextBridge, ipcRenderer } from 'electron'
import type { StrataApi } from './api'
import { IPC_CHANNELS } from '../shared/ipc'

const api: StrataApi = {
  lifecycle: {
    ready: () => ipcRenderer.invoke(IPC_CHANNELS.lifecycleReady),
    finishClose: (requestId, saved) =>
      ipcRenderer.invoke(IPC_CHANNELS.lifecycleCloseResult, { requestId, saved }),
    onPrepareClose: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, requestId: string) => listener(requestId)
      ipcRenderer.on(IPC_CHANNELS.lifecyclePrepareClose, wrapped)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.lifecyclePrepareClose, wrapped)
    },
    onCloseCancelled: (listener) => {
      const wrapped = () => listener()
      ipcRenderer.on(IPC_CHANNELS.lifecycleCloseCancelled, wrapped)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.lifecycleCloseCancelled, wrapped)
    },
  },
  history: {
    storage: () => ipcRenderer.invoke('history:storage'),
    previewPrune: (keep) => ipcRenderer.invoke('history:prune:preview', { keep }),
    prune: (keep, fingerprint) => ipcRenderer.invoke('history:prune:apply', { keep, fingerprint }),
  },
  notes: {
    history: (id) => ipcRenderer.invoke('notes:history', { id }),
    getRevision: (id, revision) => ipcRenderer.invoke('notes:revision', { id, revision }),
    restoreRevision: (id, revision, expectedRevision) =>
      ipcRenderer.invoke('notes:revision:restore', { id, revision, expectedRevision }),
    page: (filters) => ipcRenderer.invoke('notes:page', filters),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.notesGet, { id }),
    create: (payload) => ipcRenderer.invoke(IPC_CHANNELS.notesCreate, payload),
    update: (id, patch) => ipcRenderer.invoke(IPC_CHANNELS.notesUpdate, { id, patch }),
    delete: (id, expectedRevision) => ipcRenderer.invoke(IPC_CHANNELS.notesDelete, { id, expectedRevision }),
    restore: (id, expectedRevision) =>
      ipcRenderer.invoke(IPC_CHANNELS.notesRestore, { id, expectedRevision }),
    archive: (id, archived, expectedRevision) =>
      ipcRenderer.invoke(IPC_CHANNELS.notesArchive, { id, archived, expectedRevision }),
    star: (id, starred, expectedRevision) =>
      ipcRenderer.invoke(IPC_CHANNELS.notesStar, { id, starred, expectedRevision }),
  },
  tags: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.tagsList),
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    create: (payload) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreate, payload),
    update: (id, payload) => ipcRenderer.invoke(IPC_CHANNELS.projectsUpdate, { id, ...payload }),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsDelete, { id }),
    importFolder: (payload) => ipcRenderer.invoke(IPC_CHANNELS.projectsImportFolder, payload),
    reorder: (projectIds) => ipcRenderer.invoke(IPC_CHANNELS.projectsReorder, { projectIds }),
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
    listRecent: () => ipcRenderer.invoke(IPC_CHANNELS.backupListRecent),
    restoreSelect: () => ipcRenderer.invoke(IPC_CHANNELS.backupRestoreSelect),
    restoreNamed: (name) => ipcRenderer.invoke(IPC_CHANNELS.backupRestoreNamed, { name }),
  },
  ai: {
    listProposals: () => ipcRenderer.invoke('ai:proposals:list'),
    resolveProposal: (id, approved) => ipcRenderer.invoke('ai:proposals:resolve', { id, approved }),
    listThreads: () => ipcRenderer.invoke(IPC_CHANNELS.aiThreadsList),
    deleteThread: (thread_id) => ipcRenderer.invoke(IPC_CHANNELS.aiThreadDelete, { threadId: thread_id }),
    renameThread: (thread_id, title) =>
      ipcRenderer.invoke(IPC_CHANNELS.aiThreadRename, { threadId: thread_id, title }),
    setThreadModel: (thread_id, model) =>
      ipcRenderer.invoke(IPC_CHANNELS.aiThreadSetModel, { threadId: thread_id, model }),
    listMessages: (thread_id) => ipcRenderer.invoke(IPC_CHANNELS.aiMessagesList, { threadId: thread_id }),
    sendMessage: (payload) => ipcRenderer.invoke(IPC_CHANNELS.aiSendMessage, payload),
    searchChats: (query) => ipcRenderer.invoke(IPC_CHANNELS.aiSearchChats, { query }),
    transcribeAudio: (payload) => ipcRenderer.invoke(IPC_CHANNELS.aiTranscribeAudio, payload),
    listEdits: (noteId) => ipcRenderer.invoke(IPC_CHANNELS.aiEditsList, { noteId }),
    revertEdit: (editId) => ipcRenderer.invoke(IPC_CHANNELS.aiEditsRevert, { editId }),
    clearRouteLogs: () => ipcRenderer.invoke('ai:route-logs:clear'),
    listRouteLogs: (thread_id) =>
      ipcRenderer.invoke(IPC_CHANNELS.aiRouteLogsList, thread_id ? { threadId: thread_id } : undefined),
    modelCatalog: () => ipcRenderer.invoke(IPC_CHANNELS.aiModelCatalog),
  },
  links: {
    backlinks: (note_id) => ipcRenderer.invoke(IPC_CHANNELS.linksBacklinks, { id: note_id }),
    resolveTarget: (raw_target) =>
      ipcRenderer.invoke(IPC_CHANNELS.linksResolveTarget, { rawTarget: raw_target }),
    createMissingNote: (title) => ipcRenderer.invoke(IPC_CHANNELS.linksCreateMissingNote, { title }),
    relatedNotes: (note_id) => ipcRenderer.invoke(IPC_CHANNELS.linksRelatedNotes, { id: note_id }),
  },
  publish: {
    selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.dialogSelectFolder),
    htmlFile: (payload) => ipcRenderer.invoke(IPC_CHANNELS.publishHtmlFile, payload),
  },
  onCommand: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, command: string) => listener(command)
    ipcRenderer.on('ui:command', wrapped)
    return () => ipcRenderer.removeListener('ui:command', wrapped)
  },
  onDataChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, changed: ChangedDomains) => listener(changed)
    ipcRenderer.on('data:changed', wrapped)
    return () => ipcRenderer.removeListener('data:changed', wrapped)
  },
}

contextBridge.exposeInMainWorld('strata', api)
