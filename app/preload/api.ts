import type {
  AiChatResponse,
  AiMessage,
  AiNoteEdit,
  AiOpenNoteContext,
  AiRouteLog,
  AiSearchResult,
  AiThreadSummary,
  AiTranscriptionResult,
  BackupResult,
  Note,
  NoteLink,
  NoteUpdatePatch,
  NotesFilter,
  Project,
  Settings,
} from '../shared/types'

export interface BackupListing {
  name: string
  createdAt: string
  sizeBytes: number
}

export interface StrataApi {
  lifecycle: {
    ready: () => Promise<void>
    finishClose: (requestId: string, saved: boolean) => Promise<boolean>
    onPrepareClose: (listener: (requestId: string) => void) => () => void
    onCloseCancelled: (listener: () => void) => () => void
  }
  history: {
    storage: () => Promise<{ revisions: number; bytes: number }>
    previewPrune: (keep: number) => Promise<{ count: number; bytes: number; fingerprint: string }>
    prune: (keep: number, fingerprint: string) => Promise<number>
  }
  notes: {
    history: (
      id: string,
    ) => Promise<
      Array<{ revision: number; source: string; operation: string; createdAt: string; bytes: number }>
    >
    getRevision: (id: string, revision: number) => Promise<import('../shared/types').NoteRevision | null>
    restoreRevision: (id: string, revision: number, expectedRevision: number) => Promise<Note | null>
    page: (filters?: NotesFilter) => Promise<{ notes: Note[]; nextCursor: string | null }>
    get: (id: string) => Promise<Note | null>
    create: (payload?: {
      content?: string
      tags?: string[]
      starred?: boolean
      archived?: boolean
      projectId?: string | null
      projectName?: string
    }) => Promise<Note>
    update: (id: string, patch: NoteUpdatePatch) => Promise<Note | null>
    delete: (id: string, expectedRevision: number) => Promise<boolean>
    restore: (id: string, expectedRevision: number) => Promise<Note | null>
    archive: (id: string, archived: boolean, expectedRevision: number) => Promise<Note | null>
    star: (id: string, starred: boolean, expectedRevision: number) => Promise<Note | null>
  }
  tags: {
    list: () => Promise<Array<{ name: string; count: number }>>
  }
  projects: {
    list: () => Promise<Project[]>
    create: (payload: { name: string }) => Promise<Project>
    update: (id: string, payload: { name: string }) => Promise<Project | null>
    delete: (id: string) => Promise<boolean>
    importFolder: (payload: {
      projectName: string
      files: Array<{ name: string; content: string }>
    }) => Promise<{ project: Project; notes: Note[]; count: number }>
    reorder: (projectIds: string[]) => Promise<Project[]>
  }
  settings: {
    get: () => Promise<Settings>
    set: (patch: Partial<Settings>) => Promise<Settings>
  }
  exports: {
    pdf: (payload: { html: string }) => Promise<Uint8Array>
    print: (payload: { html: string }) => Promise<boolean>
  }
  backups: {
    createNow: () => Promise<BackupResult>
    openFolder: () => Promise<boolean>
    listRecent: () => Promise<BackupListing[]>
    restoreSelect: () => Promise<{ canceled: boolean }>
    restoreNamed: (name: string) => Promise<{ canceled: boolean }>
  }
  ai: {
    listProposals: (threadId: string) => Promise<Array<{ id: string; payload: unknown; createdAt: string }>>
    resolveProposal: (id: string, approved: boolean) => Promise<unknown>
    listThreads: () => Promise<AiThreadSummary[]>
    deleteThread: (thread_id: string) => Promise<boolean>
    renameThread: (thread_id: string, title: string) => Promise<boolean>
    setThreadModel: (thread_id: string, model: string) => Promise<boolean>
    listMessages: (thread_id: string) => Promise<AiMessage[]>
    cancelRequest: (requestId: string) => Promise<boolean>
    sendMessage: (payload: {
      requestId?: string
      threadId?: string
      message: string
      openNotes?: AiOpenNoteContext[]
    }) => Promise<AiChatResponse>
    searchChats: (query: string) => Promise<AiSearchResult[]>
    transcribeAudio: (payload: {
      requestId?: string
      base64Audio: string
      mimeType: string
      prompt?: string
      language?: string
    }) => Promise<AiTranscriptionResult>
    listEdits: (noteId: string) => Promise<AiNoteEdit[]>
    revertEdit: (editId: string) => Promise<boolean>
    clearRouteLogs: () => Promise<number>
    listRouteLogs: (thread_id?: string) => Promise<AiRouteLog[]>
    modelCatalog: () => Promise<Array<{ providerId: string; providerLabel: string; model: string }>>
  }
  links: {
    backlinks: (note_id: string) => Promise<Array<{ link: NoteLink; source: Note }>>
    resolveTarget: (raw_target: string) => Promise<import('../shared/types').WikiLinkResolution>
    createMissingNote: (title: string) => Promise<Note | null>
    relatedNotes: (note_id: string) => Promise<Array<{ note: Note; reason: string; score: number }>>
  }
  publish: {
    selectFolder: () => Promise<string | null>
    htmlFile: (payload: {
      destination: string
      title: string
      html: string
    }) => Promise<{ success: boolean; path?: string; error?: string }>
  }
  onCommand: (listener: (command: string) => void) => () => void
  onDataChanged: (
    listener: (changed: import('../shared/changedDomains').ChangedDomains) => void,
  ) => () => void
}
