import { ALL_CHANGED, type ChangedDomains } from '@shared/changedDomains'
import { create } from 'zustand'
import type { Note, Settings } from '@shared/types'
import { DEFAULT_HOTKEYS } from '@shared/hotkeys'
import { DEFAULT_HOME_TILES } from '@shared/homeTiles'
import { type ActiveFilter } from '@renderer/src/domain/filtering'
import { normalizeTag } from '@renderer/src/domain/noteUtils'
import { notesService } from '@renderer/src/services/notesService'
import { projectsService } from '@renderer/src/services/projectsService'
import { settingsService } from '@renderer/src/services/settingsService'
import type { Project } from '@shared/types'
import { DEFAULT_SIDEBAR_LAYOUT } from '@shared/sidebarLayout'

let navigationGeneration = 0
let pendingNavigationId: string | null = null
let searchGeneration = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'conflict' | 'unsaved'

interface FlushDraftOptions {
  allowDiscardUntouchedEmpty?: boolean
}

const is_effectively_untouched_content = (content: string): boolean => {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  return '' === normalized || '# Untitled' === normalized
}

const deletedRevisions = new Map<string, number>()
const savesInFlight = new Map<string, { completion: Promise<void>; observedRevision: number }>()
const observe_note_revision = (id: string, revision: number): void => {
  const pending = savesInFlight.get(id)
  if (pending) pending.observedRevision = Math.max(pending.observedRevision, revision)
}
const NOTE_SUMMARY_LENGTH = 280
const HYDRATED_NOTE_IDLE_MS = 2 * 60 * 1000

const summarize_note_content = (content: string): string => content.slice(0, NOTE_SUMMARY_LENGTH)

const upsert_note = (notes: Note[], note: Note): Note[] => {
  const index = notes.findIndex((candidate) => candidate.id === note.id)
  if (-1 === index) return [note, ...notes]
  const next_notes = [...notes]
  next_notes[index] = note
  return next_notes
}

interface AppState {
  nextCursor: string | null
  retrievalError: string | null
  listingIds: string[]
  refreshListing: (more?: boolean) => Promise<void>
  resolveConflict: (id: string, saveCopy: boolean) => Promise<void>
  notes: Note[]
  projects: Project[]
  selectedNoteId: string | null
  drafts: Record<string, string>
  untouchedNewNoteIds: Record<string, true>
  noteSummaryCache: Record<string, string>
  noteLastAccessedAt: Record<string, number>
  tags: Array<{ name: string; count: number }>
  activeFilter: ActiveFilter
  selectedTag: string | null
  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
  searchQuery: string
  settings: Settings
  showSettings: boolean
  showFiltersPanel: boolean
  saveStates: Record<string, SaveState>
  openTabs: string[]
  navigationBackStack: string[]
  navigationForwardStack: string[]
  splitNoteIds: string[]
  splitRatios: number[]
  splitLayout: 'columns' | 'grid'
  splitGridColumns: number
  toggleSplitNote: (id: string) => void
  clearSplitNote: () => void
  setSplitResizeRatio: (resizerIndex: number, leftFraction: number) => void
  setSplitLayout: (layout: 'columns' | 'grid') => void
  setSplitGridColumns: (cols: number) => void
  linksVersion: number
  historyVersion: number
  refreshDomains: (changed: ChangedDomains) => Promise<void>
  load: () => Promise<void>
  navigationError: string | null
  navigateToNote: (id: string, newTab?: boolean) => Promise<boolean>
  ensureNote: (id: string) => Promise<void>
  hydrateNote: (id: string) => Promise<void>
  touchNote: (id: string) => void
  evictInactiveNoteBodies: () => void
  refreshTags: () => Promise<void>
  setSearchQuery: (value: string) => void
  setActiveFilter: (value: ActiveFilter) => void
  setSelectedTag: (value: string | null) => void
  selectNote: (id: string | null) => void
  openNoteInTab: (id: string) => void
  closeTab: (id: string) => Promise<boolean>
  activateTab: (id: string) => void
  reorderTabs: (from_id: string, to_id: string) => void
  navigateBack: () => void
  navigateForward: () => void
  createNote: () => Promise<void>
  setDraft: (id: string, content: string) => void
  prepareToClose: () => Promise<boolean>
  flushDraft: (id: string, options?: FlushDraftOptions) => Promise<void>
  toggleStar: (id: string) => Promise<void>
  toggleArchive: (id: string) => Promise<void>
  deleteSelected: () => Promise<Note | null>
  restoreDeletedNote: (id: string) => Promise<boolean>
  setTagsForSelected: (tags: string[]) => Promise<void>
  setTagsForNote: (id: string, tags: string[]) => Promise<void>
  setProjectForNote: (id: string, projectId: string | null) => Promise<void>
  setShowSettings: (show: boolean) => void
  setShowFiltersPanel: (show: boolean) => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  filteredNotes: () => Note[]
  selectedNote: () => Note | null
  effectiveContent: () => string
}

const defaultSettings: Settings = {
  theme: 'dark',
  defaultView: 'all',
  confirmDelete: true,
  sortMode: 'updated_desc',
  openAiApiKey: '',
  openAiModel: 'gpt-4o',
  autoBackupKeepCount: 0,
  autoBackupFrequency: '24h',
  lastAutoBackupAt: null,
  aiEditMode: 'confirm',
  aiRoutingMode: 'auto',
  aiCheapProvider: 'deepseek-flash',
  aiCheapModel: 'deepseek-v4-flash',
  aiPremiumProvider: 'openai',
  aiPremiumModel: 'gpt-4o',
  aiDeepseekApiKey: '',
  aiKimiApiKey: '',
  aiOpenrouterApiKey: '',
  aiCustomApiKey: '',
  aiCustomBaseUrl: '',
  aiCustomCapabilities: { tools: true, systemMessages: true, temperature: true },
  aiShowRoutingDecisions: true,
  aiEnableRouteLogs: false,
  aiRouteLogRetentionDays: 30,
  aiCheapConfidenceThreshold: 0.85,
  aiPremiumFallbackThreshold: 0.65,
  pinnedTags: [],
  pinnedNotes: [],
  hotkeys: DEFAULT_HOTKEYS,
  aiModelCatalog: '{}',
  homeTiles: DEFAULT_HOME_TILES,
  sidebarLayout: DEFAULT_SIDEBAR_LAYOUT,
}

const apply_metadata_result = (state: AppState, updated: Note): Partial<AppState> => {
  observe_note_revision(updated.id, updated.revision)
  const current = state.notes.find((note) => note.id === updated.id)
  if (!current || current.revision > updated.revision) return {}
  return {
    notes: state.notes.map((note) => (note.id === updated.id ? updated : note)),
    noteSummaryCache: { ...state.noteSummaryCache, [updated.id]: summarize_note_content(updated.content) },
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  notes: [],
  nextCursor: null,
  listingIds: [],
  retrievalError: null,
  projects: [],
  selectedNoteId: null,
  navigationError: null,
  drafts: {},
  untouchedNewNoteIds: {},
  noteSummaryCache: {},
  noteLastAccessedAt: {},
  tags: [],
  activeFilter: 'all',
  selectedTag: null,
  selectedProjectId: null,
  setSelectedProjectId(id) {
    set({ selectedProjectId: id })
    void get().refreshListing()
  },
  searchQuery: '',
  settings: defaultSettings,
  showSettings: false,
  showFiltersPanel: false,
  saveStates: {},
  openTabs: [],
  navigationBackStack: [],
  navigationForwardStack: [],
  splitNoteIds: [],
  splitRatios: [],
  splitLayout: 'columns',
  splitGridColumns: 3,

  toggleSplitNote(id) {
    const state = get()
    const idx = state.splitNoteIds.indexOf(id)
    if (idx >= 0) {
      const newIds = state.splitNoteIds.filter((nid) => nid !== id)
      const count = newIds.length
      const newRatios = count > 0 ? Array(count + 1).fill(1 / (count + 1)) : []
      set({ splitNoteIds: newIds, splitRatios: newRatios })
    } else {
      const newIds = [...state.splitNoteIds, id]
      const count = newIds.length
      const newRatios = Array(count + 1).fill(1 / (count + 1))
      set({ splitNoteIds: newIds, splitRatios: newRatios })
    }
  },

  clearSplitNote() {
    set({ splitNoteIds: [], splitRatios: [] })
  },

  setSplitResizeRatio(resizerIndex, leftFraction) {
    const state = get()
    const ratios = [...state.splitRatios]
    if (resizerIndex < 0 || resizerIndex >= ratios.length - 1) return
    const clamped = Math.max(0.15, Math.min(0.85, leftFraction))
    const pairTotal = ratios[resizerIndex] + ratios[resizerIndex + 1]
    ratios[resizerIndex] = pairTotal * clamped
    ratios[resizerIndex + 1] = pairTotal * (1 - clamped)
    set({ splitRatios: ratios })
  },

  setSplitLayout(layout) {
    set({ splitLayout: layout })
  },

  setSplitGridColumns(cols) {
    set({ splitGridColumns: Math.max(2, Math.min(6, cols)) })
  },

  async refreshListing(more = false) {
    const generation = ++searchGeneration
    const state = get()
    try {
      const page = await notesService.page({
        query: state.searchQuery || undefined,
        tag: state.selectedTag ?? undefined,
        projectId: state.selectedProjectId ?? undefined,
        starred: state.activeFilter === 'starred' ? true : undefined,
        archived:
          state.activeFilter === 'archived' ? true : state.activeFilter === 'starred' ? undefined : false,
        untagged: state.activeFilter === 'untagged' ? true : undefined,
        sort: state.settings.sortMode,
        limit: 100,
        cursor: more ? (state.nextCursor ?? undefined) : undefined,
      })
      for (const note of page.notes) observe_note_revision(note.id, note.revision)
      if (generation !== searchGeneration) return
      set((current) => {
        const existing = new Map(current.notes.map((note) => [note.id, note]))
        const conflicts = page.notes.filter(
          (note) =>
            note.revision > (existing.get(note.id)?.revision ?? 0) && current.drafts[note.id] !== undefined,
        )
        const merged = page.notes.map((note) => {
          const old = existing.get(note.id)
          return old &&
            (old.revision > note.revision ||
              current.drafts[note.id] !== undefined ||
              (old.contentLoaded && old.revision === note.revision))
            ? old
            : note
        })
        const keep = new Set([
          ...(pendingNavigationId ? [pendingNavigationId] : []),
          ...current.openTabs,
          ...current.splitNoteIds,
          ...Object.keys(current.drafts),
          ...(current.selectedNoteId ? [current.selectedNoteId] : []),
        ])
        const received = new Set(merged.map((note) => note.id))
        const retained = current.notes.filter((note) => !received.has(note.id) && (more || keep.has(note.id)))
        return {
          notes: [...retained, ...merged],
          listingIds: more
            ? [...new Set([...current.listingIds, ...page.notes.map((note) => note.id)])]
            : page.notes.map((note) => note.id),
          nextCursor: page.nextCursor,
          retrievalError: null,
          saveStates: {
            ...current.saveStates,
            ...Object.fromEntries(conflicts.map((note) => [note.id, 'conflict' as const])),
          },
        }
      })
    } catch {
      if (generation === searchGeneration)
        set({ retrievalError: 'Could not load notes. Retry when the local service is available.' })
    }
  },

  linksVersion: 0,
  historyVersion: 0,
  async load() {
    set({ settings: await settingsService.get() })
    await get().refreshDomains(ALL_CHANGED)
  },

  async refreshDomains(changed) {
    set((state) => ({
      linksVersion: state.linksVersion + Number(changed.links),
      historyVersion: state.historyVersion + Number(changed.history),
    }))
    await Promise.all([
      changed.projects || changed.notes
        ? projectsService.list().then((projects) =>
            set((state) => ({
              projects,
              selectedProjectId: projects.some((project) => project.id === state.selectedProjectId)
                ? state.selectedProjectId
                : null,
            })),
          )
        : undefined,
      changed.tags ? notesService.listTags().then((tags) => set({ tags })) : undefined,
    ])
    if (!changed.notes) return
    await get().refreshListing()
    const state = get()
    // Refresh open clean notes even when they are outside the current result page.
    await Promise.all(
      state.openTabs.map(async (id) => {
        const full = await notesService.get(id)
        observe_note_revision(id, full?.revision ?? Infinity)
        set((current) => {
          const existing = current.notes.find((note) => note.id === id)
          if (full && existing && full.revision < existing.revision) return {}
          if (current.drafts[id] !== undefined)
            return !full || full.deletedAt || full.revision > (existing?.revision ?? 0)
              ? { saveStates: { ...current.saveStates, [id]: 'conflict' as const } }
              : {}
          if (!full || full.deletedAt)
            return {
              notes: current.notes.filter((note) => note.id !== id),
              openTabs: current.openTabs.filter((tab) => tab !== id),
              selectedNoteId: current.selectedNoteId === id ? null : current.selectedNoteId,
            }
          return { notes: upsert_note(current.notes, full) }
        })
      }),
    )
    if (get().selectedNoteId) await get().hydrateNote(get().selectedNoteId!)
  },

  async resolveConflict(id, saveCopy) {
    const draft = get().drafts[id]
    const baseRevision = get().notes.find((note) => note.id === id)?.revision ?? 0
    if (saveCopy && draft !== undefined)
      await notesService.createWithPayload({ content: draft, tags: ['recovered-draft'] })
    const latest = await notesService.get(id)
    observe_note_revision(id, latest?.revision ?? Infinity)
    set((current) => {
      if (current.drafts[id] !== draft) return {}
      const existing = current.notes.find((note) => note.id === id)
      const recovered = existing && existing.revision > (latest?.revision ?? baseRevision) ? existing : latest
      return {
        drafts: Object.fromEntries(Object.entries(current.drafts).filter(([key]) => key !== id)),
        notes:
          recovered && !recovered.deletedAt
            ? upsert_note(current.notes, recovered)
            : current.notes.filter((note) => note.id !== id),
        saveStates: { ...current.saveStates, [id]: 'saved' },
      }
    })
    await get().load()
  },

  async navigateToNote(id, newTab = false) {
    const generation = ++navigationGeneration
    pendingNavigationId = id
    const selected = get().selectedNoteId
    set({ navigationError: null })
    try {
      await get().ensureNote(id)
      if (generation !== navigationGeneration || get().selectedNoteId !== selected) return false
      if (selected && selected !== id) {
        await get().flushDraft(selected, { allowDiscardUntouchedEmpty: true })
        if (generation !== navigationGeneration || get().selectedNoteId !== selected) return false
        const draft = get().drafts[selected]
        if (draft !== undefined && draft !== get().notes.find((note) => note.id === selected)?.content) {
          throw new Error('Draft not saved')
        }
      }
      if (newTab) get().openNoteInTab(id)
      else get().selectNote(id)
      return true
    } catch {
      if (generation === navigationGeneration && get().selectedNoteId === selected) {
        set({ navigationError: 'Could not open this note. Your current draft is preserved.' })
      }
      return false
    } finally {
      if (generation === navigationGeneration) pendingNavigationId = null
    }
  },

  async ensureNote(id) {
    const current = get().notes.find((note) => note.id === id)
    if (current?.deletedAt) throw new Error('Note unavailable')
    if (current) {
      await get().hydrateNote(id)
      if (!get().notes.find((note) => note.id === id)?.contentLoaded) throw new Error('Note unavailable')
      return
    }
    const note = await notesService.get(id)
    observe_note_revision(id, note?.revision ?? Infinity)
    if (!note || note.deletedAt) throw new Error('Note unavailable')
    set((state) =>
      state.notes.some((current) => current.id === id)
        ? state
        : {
            notes: upsert_note(state.notes, note),
            noteSummaryCache: { ...state.noteSummaryCache, [id]: summarize_note_content(note.content) },
          },
    )
  },

  async hydrateNote(id) {
    const current = get().notes.find((note) => note.id === id)
    if (!current || current.contentLoaded) return
    const full_note = await notesService.get(id)
    observe_note_revision(id, full_note?.revision ?? Infinity)
    if (!full_note || full_note.deletedAt) return
    set((state) => {
      const latest = state.notes.find((note) => note.id === id)
      // A delayed read must not resurrect a removed note or replace a newer revision.
      if (!latest || latest.revision > full_note.revision) return state
      if (state.drafts[id] !== undefined && full_note.revision !== latest.revision) {
        return { saveStates: { ...state.saveStates, [id]: 'conflict' } }
      }
      return {
        notes: upsert_note(state.notes, full_note),
        noteSummaryCache: { ...state.noteSummaryCache, [id]: summarize_note_content(full_note.content) },
        noteLastAccessedAt: { ...state.noteLastAccessedAt, [id]: Date.now() },
      }
    })
  },

  touchNote(id) {
    set((state) => ({
      noteLastAccessedAt: {
        ...state.noteLastAccessedAt,
        [id]: Date.now(),
      },
    }))
  },

  evictInactiveNoteBodies() {
    const state = get()
    const now = Date.now()
    const protected_ids = new Set(
      [state.selectedNoteId, ...state.openTabs, ...state.splitNoteIds, ...Object.keys(state.drafts)].filter(
        Boolean,
      ) as string[],
    )

    set({
      notes: state.notes.map((note) => {
        if (!note.contentLoaded) return note
        if (protected_ids.has(note.id)) return note
        const last_accessed_at = state.noteLastAccessedAt[note.id] ?? 0
        if (now - last_accessed_at < HYDRATED_NOTE_IDLE_MS) return note
        return {
          ...note,
          content: state.noteSummaryCache[note.id] ?? summarize_note_content(note.content),
          contentLoaded: false,
        }
      }),
    })
  },

  async refreshTags() {
    set({ tags: await notesService.listTags() })
  },

  setSearchQuery(searchQuery) {
    set({ searchQuery })
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      void get().refreshListing()
    }, 180)
  },

  setActiveFilter(activeFilter) {
    set({ activeFilter, selectedTag: null })
    void get().refreshListing()
  },

  setSelectedTag(selectedTag) {
    set({ selectedTag, activeFilter: 'all' })
    void get().refreshListing()
  },

  selectNote(selectedNoteId) {
    set({ selectedNoteId })
    if (selectedNoteId) {
      get().touchNote(selectedNoteId)
      void get().hydrateNote(selectedNoteId)
    }
  },

  openNoteInTab(id) {
    const state = get()
    if (state.selectedNoteId && state.selectedNoteId !== id) {
      const back = [...state.navigationBackStack, state.selectedNoteId]
      if (back.length > 80) back.shift()
      set({ navigationBackStack: back, navigationForwardStack: [] })
    }
    const already = state.openTabs.includes(id)
    const tabs = already ? state.openTabs : [...state.openTabs, id]
    set({ openTabs: tabs, selectedNoteId: id })
    get().touchNote(id)
    void get().hydrateNote(id)
  },

  async closeTab(id) {
    await get().flushDraft(id)
    const state = get()
    if (state.drafts[id] !== undefined) {
      set({ navigationError: 'Could not close this tab. Your draft is preserved.' })
      return false
    }
    const tabs = state.openTabs.filter((t) => t !== id)
    const drafts = { ...state.drafts }
    const untouched_new_note_ids = { ...state.untouchedNewNoteIds }
    delete drafts[id]
    delete untouched_new_note_ids[id]
    let next = state.selectedNoteId
    if (next === id) {
      const idx = state.openTabs.indexOf(id)
      next = tabs[Math.min(idx, tabs.length - 1)] ?? null
    }
    const split_note_ids = state.splitNoteIds.filter((nid) => nid !== id)
    const split_ratios =
      split_note_ids.length === state.splitNoteIds.length
        ? state.splitRatios
        : split_note_ids.length > 0
          ? Array(split_note_ids.length + 1).fill(1 / (split_note_ids.length + 1))
          : []
    set({
      openTabs: tabs,
      selectedNoteId: next,
      drafts,
      untouchedNewNoteIds: untouched_new_note_ids,
      splitNoteIds: split_note_ids,
      splitRatios: split_ratios,
      navigationError: null,
    })
    return true
  },

  activateTab(id) {
    const state = get()
    if (state.selectedNoteId && state.selectedNoteId !== id) {
      const back = [...state.navigationBackStack, state.selectedNoteId]
      if (back.length > 80) back.shift()
      set({ selectedNoteId: id, navigationBackStack: back, navigationForwardStack: [] })
    } else {
      set({ selectedNoteId: id })
    }
    get().touchNote(id)
    void get().hydrateNote(id)
  },

  reorderTabs(from_id, to_id) {
    if (from_id === to_id) return
    set((state) => {
      const from_index = state.openTabs.indexOf(from_id)
      const to_index = state.openTabs.indexOf(to_id)
      if (-1 === from_index || -1 === to_index || from_index === to_index) return state

      const reordered = [...state.openTabs]
      const [moved] = reordered.splice(from_index, 1)
      reordered.splice(to_index, 0, moved)

      return { openTabs: reordered }
    })
  },

  navigateBack() {
    const state = get()
    const back = [...state.navigationBackStack]
    if (0 === back.length) return
    const prev = back.pop()!
    const forward = [...state.navigationForwardStack, state.selectedNoteId!]
    if (forward.length > 80) forward.shift()
    set({ selectedNoteId: prev, navigationBackStack: back, navigationForwardStack: forward })
    get().touchNote(prev)
    void get().hydrateNote(prev)
  },

  navigateForward() {
    const state = get()
    const forward = [...state.navigationForwardStack]
    if (0 === forward.length) return
    const next = forward.pop()!
    const back = [...state.navigationBackStack, state.selectedNoteId!]
    if (back.length > 80) back.shift()
    set({ selectedNoteId: next, navigationBackStack: back, navigationForwardStack: forward })
    get().touchNote(next)
    void get().hydrateNote(next)
  },

  async createNote() {
    const note = await notesService.create()
    set((state) => ({
      notes: upsert_note(state.notes, note),
      listingIds: [note.id, ...state.listingIds],
      selectedNoteId: note.id,
      openTabs: [...state.openTabs, note.id],
      drafts: { ...state.drafts, [note.id]: note.content },
      noteSummaryCache: { ...state.noteSummaryCache, [note.id]: summarize_note_content(note.content) },
      noteLastAccessedAt: { ...state.noteLastAccessedAt, [note.id]: Date.now() },
      untouchedNewNoteIds: { ...state.untouchedNewNoteIds, [note.id]: true },
      saveStates: { ...state.saveStates, [note.id]: 'saved' },
    }))
    await get().refreshTags()
  },

  setDraft(id, content) {
    set((state) => {
      const untouched_new_note_ids = { ...state.untouchedNewNoteIds }
      if (untouched_new_note_ids[id] && !is_effectively_untouched_content(content)) {
        delete untouched_new_note_ids[id]
      }

      const drafts = { ...state.drafts, [id]: content }

      return {
        drafts,
        noteLastAccessedAt: {
          ...state.noteLastAccessedAt,
          [id]: Date.now(),
        },
        untouchedNewNoteIds: untouched_new_note_ids,
        saveStates: {
          ...state.saveStates,
          [id]: state.saveStates[id] === 'conflict' ? 'conflict' : 'unsaved',
        },
      }
    })
  },

  async prepareToClose() {
    for (const id of Object.keys(get().drafts)) await get().flushDraft(id)
    return Object.keys(get().drafts).length === 0
  },

  async flushDraft(id, options) {
    const pending = savesInFlight.get(id)
    if (pending) {
      await pending.completion
      return get().flushDraft(id, options)
    }
    const state = get()
    const draft = state.drafts[id]
    if ('string' !== typeof draft || state.saveStates[id] === 'conflict') return

    const note = state.notes.find((item) => item.id === id)
    if (
      Boolean(options?.allowDiscardUntouchedEmpty) &&
      state.untouchedNewNoteIds[id] &&
      note &&
      is_effectively_untouched_content(draft) &&
      is_effectively_untouched_content(note.content) &&
      !note.starred &&
      !note.archived &&
      0 === note.tags.length
    ) {
      if (await notesService.delete(id, note.revision)) {
        set((current) => {
          if (current.drafts[id] === undefined) return {}
          if (current.drafts[id] !== draft || !current.untouchedNewNoteIds[id]) {
            return { saveStates: { ...current.saveStates, [id]: 'conflict' as const } }
          }
          const drafts = { ...current.drafts }
          const untouched_new_note_ids = { ...current.untouchedNewNoteIds }
          delete drafts[id]
          delete untouched_new_note_ids[id]
          return {
            notes: current.notes.filter((item) => item.id !== id),
            drafts,
            untouchedNewNoteIds: untouched_new_note_ids,
            openTabs: current.openTabs.filter((tab_id) => tab_id !== id),
            navigationBackStack: current.navigationBackStack.filter((tab_id) => tab_id !== id),
            navigationForwardStack: current.navigationForwardStack.filter((tab_id) => tab_id !== id),
            saveStates: { ...current.saveStates, [id]: 'saved' },
          }
        })
        await get().refreshTags()
      }
      return
    }

    try {
      if (!note) return
      set((current) => ({ saveStates: { ...current.saveStates, [id]: 'saving' } }))
      const saving = notesService.update(id, { content: draft, expectedRevision: note.revision })
      const pendingSave = {
        observedRevision: note.revision,
        completion: saving.then(
          () => {},
          () => {},
        ),
      }
      savesInFlight.set(id, pendingSave)
      const updated = await saving
      if (!updated) throw new Error('Note unavailable')
      set((current) => {
        const latest = current.notes.find((item) => item.id === id)
        if (
          !latest ||
          latest.revision > updated.revision ||
          pendingSave.observedRevision > updated.revision
        ) {
          return current.drafts[id] !== undefined
            ? { saveStates: { ...current.saveStates, [id]: 'conflict' as const } }
            : {}
        }
        const untouched_new_note_ids = { ...current.untouchedNewNoteIds }
        if (untouched_new_note_ids[id] && !is_effectively_untouched_content(draft)) {
          delete untouched_new_note_ids[id]
        }
        return {
          notes: upsert_note(current.notes, updated),
          noteSummaryCache: {
            ...current.noteSummaryCache,
            [id]: summarize_note_content(updated.content),
          },
          noteLastAccessedAt: {
            ...current.noteLastAccessedAt,
            [id]: Date.now(),
          },
          untouchedNewNoteIds: untouched_new_note_ids,
          saveStates: {
            ...current.saveStates,
            [id]: current.drafts[id] === undefined || current.drafts[id] === draft ? 'saved' : 'unsaved',
          },
          drafts:
            current.drafts[id] === draft
              ? Object.fromEntries(Object.entries(current.drafts).filter(([key]) => key !== id))
              : current.drafts,
        }
      })
    } catch (error) {
      set((current) =>
        current.drafts[id] === undefined
          ? {}
          : {
              saveStates: {
                ...current.saveStates,
                [id]: String(error).includes('REVISION_CONFLICT') ? 'conflict' : 'failed',
              },
            },
      )
    } finally {
      savesInFlight.delete(id)
    }
  },

  async toggleStar(id) {
    const current = get().notes.find((note) => note.id === id)
    if (!current) return
    const updated = await notesService.star(id, !current.starred, current.revision)
    if (!updated) return
    set((state) => apply_metadata_result(state, updated))
  },

  async toggleArchive(id) {
    const current = get().notes.find((note) => note.id === id)
    if (!current) return
    const updated = await notesService.archive(id, !current.archived, current.revision)
    if (!updated) return
    set((state) => apply_metadata_result(state, updated))
    await get().refreshTags()
  },

  async deleteSelected() {
    const id = get().selectedNoteId
    if (!id) return null
    const deleted_note = get().notes.find((note) => note.id === id) ?? null
    if (!deleted_note || !(await notesService.delete(id, deleted_note.revision))) return null
    deletedRevisions.clear()
    deletedRevisions.set(id, deleted_note.revision + 1)
    set((state) => {
      const notes = state.notes.filter((note) => note.id !== id)
      const drafts = { ...state.drafts }
      const untouched_new_note_ids = { ...state.untouchedNewNoteIds }
      delete drafts[id]
      delete untouched_new_note_ids[id]
      return {
        notes,
        drafts,
        untouchedNewNoteIds: untouched_new_note_ids,
        selectedNoteId: notes[0]?.id ?? null,
        openTabs: state.openTabs.filter((t) => t !== id),
        navigationBackStack: state.navigationBackStack.filter((t) => t !== id),
        navigationForwardStack: state.navigationForwardStack.filter((t) => t !== id),
        splitNoteIds: state.splitNoteIds.filter((nid) => nid !== id),
        splitRatios:
          state.splitNoteIds.filter((nid) => nid !== id).length !== state.splitNoteIds.length
            ? state.splitNoteIds.filter((nid) => nid !== id).length > 0
              ? Array(state.splitNoteIds.filter((nid) => nid !== id).length + 1).fill(
                  1 / (state.splitNoteIds.filter((nid) => nid !== id).length + 1),
                )
              : []
            : state.splitRatios,
      }
    })
    await get().refreshTags()
    return deleted_note
  },

  async restoreDeletedNote(id) {
    const expectedRevision = deletedRevisions.get(id)
    if (!expectedRevision) return false
    const restored = await notesService.restore(id, expectedRevision)
    deletedRevisions.delete(id)
    if (!restored) return false
    set((state) => ({
      notes: upsert_note(
        state.notes.filter((note) => note.id !== restored.id),
        restored,
      ),
      listingIds: [...new Set([restored.id, ...state.listingIds])],
      selectedNoteId: restored.id,
      drafts: { ...state.drafts, [restored.id]: restored.content },
      noteSummaryCache: {
        ...state.noteSummaryCache,
        [restored.id]: summarize_note_content(restored.content),
      },
      noteLastAccessedAt: {
        ...state.noteLastAccessedAt,
        [restored.id]: Date.now(),
      },
      saveStates: { ...state.saveStates, [restored.id]: 'saved' },
    }))
    await get().refreshTags()
    return true
  },

  async setTagsForSelected(tags) {
    const id = get().selectedNoteId
    if (!id) return
    void get().setTagsForNote(id, tags)
  },

  async setTagsForNote(id, tags) {
    const normalized = [...new Set(tags.map((tag) => normalizeTag(tag)).filter(Boolean))]
    const updated = await notesService.update(id, {
      tags: normalized,
      expectedRevision: get().notes.find((note) => note.id === id)?.revision,
    })
    if (!updated) return
    set((state) => apply_metadata_result(state, updated))
    await get().refreshTags()
  },

  async setProjectForNote(id, projectId) {
    const updated = await notesService.update(id, {
      projectId,
      expectedRevision: get().notes.find((note) => note.id === id)?.revision,
    })
    if (!updated) return
    set((state) => apply_metadata_result(state, updated))
  },

  setShowSettings(showSettings) {
    set({ showSettings })
  },

  setShowFiltersPanel(showFiltersPanel) {
    set({ showFiltersPanel })
  },

  async updateSettings(patch) {
    set({ settings: await settingsService.set(patch) })
    if (patch.sortMode) await get().refreshListing()
  },

  filteredNotes() {
    const state = get()
    const byId = new Map(state.notes.map((note) => [note.id, note]))
    return state.listingIds.flatMap((id) => {
      const note = byId.get(id)
      return note && !note.deletedAt ? [note] : []
    })
  },

  selectedNote() {
    const state = get()
    return state.selectedNoteId
      ? (state.notes.find((note) => note.id === state.selectedNoteId) ?? null)
      : null
  },

  effectiveContent() {
    const state = get()
    if (!state.selectedNoteId) return ''
    return (
      state.drafts[state.selectedNoteId] ??
      state.notes.find((note) => note.id === state.selectedNoteId)?.content ??
      ''
    )
  },
}))
