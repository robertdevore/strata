import type { Note, NoteUpdatePatch, NotesFilter } from '@shared/types'

export const notesService = {
  page(filters?: NotesFilter): Promise<{ notes: Note[]; nextCursor: string | null }> {
    return window.strata.notes.page(filters)
  },
  list(filters?: NotesFilter): Promise<Note[]> {
    return window.strata.notes.list(filters)
  },
  async listSummaries(filters?: NotesFilter): Promise<Note[]> {
    return window.strata.notes.listSummaries(filters)
  },
  get(id: string): Promise<Note | null> {
    return window.strata.notes.get(id)
  },
  create(): Promise<Note> {
    return window.strata.notes.create()
  },
  createWithPayload(payload: {
    content?: string
    tags?: string[]
    starred?: boolean
    archived?: boolean
    projectId?: string | null
    projectName?: string
  }): Promise<Note> {
    return window.strata.notes.create(payload)
  },
  update(id: string, patch: NoteUpdatePatch): Promise<Note | null> {
    return window.strata.notes.update(id, patch)
  },
  delete(id: string, expectedRevision: number): Promise<boolean> {
    return window.strata.notes.delete(id, expectedRevision)
  },
  restore(id: string, expectedRevision: number): Promise<Note | null> {
    return window.strata.notes.restore(id, expectedRevision)
  },
  archive(id: string, archived: boolean, expectedRevision: number): Promise<Note | null> {
    return window.strata.notes.archive(id, archived, expectedRevision)
  },
  star(id: string, starred: boolean, expectedRevision: number): Promise<Note | null> {
    return window.strata.notes.star(id, starred, expectedRevision)
  },
  listTags(): Promise<Array<{ name: string; count: number }>> {
    return window.strata.tags.list()
  },
}
