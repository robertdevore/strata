import { create } from 'zustand'
import type { Note, Settings } from '@shared/types'
import { DEFAULT_HOTKEYS } from '@shared/hotkeys'
import { DEFAULT_HOME_TILES } from '@shared/homeTiles'
import { applyFiltersAndSort, type ActiveFilter } from '@renderer/src/domain/filtering'
import { normalizeTag } from '@renderer/src/domain/noteUtils'
import { notesService } from '@renderer/src/services/notesService'
import { projectsService } from '@renderer/src/services/projectsService'
import { settingsService } from '@renderer/src/services/settingsService'
import type { Project } from '@shared/types'
import { DEFAULT_SIDEBAR_LAYOUT } from '@shared/sidebarLayout'

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

interface FlushDraftOptions {
	allowDiscardUntouchedEmpty?: boolean
}

const is_effectively_untouched_content = (content: string): boolean => {
	const normalized = content.replace(/\r\n/g, '\n').trim()
	return '' === normalized || '# Untitled' === normalized
}

/** Maximum number of in-memory drafts before evicting stale entries. */
const MAX_DRAFTS = 50

interface AppState {
	notes: Note[]
	projects: Project[]
	selectedNoteId: string | null
	drafts: Record<string, string>
	untouchedNewNoteIds: Record<string, true>
	tags: Array<{ name: string; count: number }>
	activeFilter: ActiveFilter
	selectedTag: string | null
	searchQuery: string
	settings: Settings
	showSettings: boolean
	showFiltersPanel: boolean
	saveState: SaveState
	lastSavedAt: string | null
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
	load: () => Promise<void>
	refreshTags: () => Promise<void>
	setSearchQuery: (value: string) => void
	setActiveFilter: (value: ActiveFilter) => void
	setSelectedTag: (value: string | null) => void
	selectNote: (id: string | null) => void
	openNoteInTab: (id: string) => void
	closeTab: (id: string) => void
	activateTab: (id: string) => void
	reorderTabs: (from_id: string, to_id: string) => void
	navigateBack: () => void
	navigateForward: () => void
	createNote: () => Promise<void>
	setDraft: (id: string, content: string) => void
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
	aiShowRoutingDecisions: true,
	aiEnableRouteLogs: true,
	aiCheapConfidenceThreshold: 0.85,
	aiPremiumFallbackThreshold: 0.65,
	pinnedTags: [],
	pinnedNotes: [],
	hotkeys: DEFAULT_HOTKEYS,
	aiModelCatalog: '{}',
	homeTiles: DEFAULT_HOME_TILES,
	sidebarLayout: DEFAULT_SIDEBAR_LAYOUT,
}

export const useAppStore = create<AppState>((set, get) => ({
	notes: [],
	projects: [],
	selectedNoteId: null,
	drafts: {},
	untouchedNewNoteIds: {},
	tags: [],
	activeFilter: 'all',
	selectedTag: null,
	searchQuery: '',
	settings: defaultSettings,
	showSettings: false,
	showFiltersPanel: false,
	saveState: 'idle',
	lastSavedAt: null,
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

	async load() {
		const [notes, projects, tags, settings] = await Promise.all([notesService.list(), projectsService.list(), notesService.listTags(), settingsService.get()])
		const activeFilter = 'starred' === settings.defaultView ? 'starred' : 'all'
		set((state) => {
			const note_ids = new Set(notes.map((note) => note.id))
			const project_ids = new Set(projects.map((project) => project.id))
			const open_tabs = state.openTabs.filter((note_id) => note_ids.has(note_id))
			const selected_note_id = state.selectedNoteId && note_ids.has(state.selectedNoteId)
				? state.selectedNoteId
				: (open_tabs[0] ?? null)

			const drafts: Record<string, string> = {}
			for (const [note_id, draft] of Object.entries(state.drafts)) {
				if (note_ids.has(note_id)) drafts[note_id] = draft
			}

			const untouched_new_note_ids: Record<string, true> = {}
			for (const note_id of Object.keys(state.untouchedNewNoteIds)) {
				if (note_ids.has(note_id)) untouched_new_note_ids[note_id] = true
			}

			const split_note_ids = state.splitNoteIds.filter((nid) => note_ids.has(nid))
			const split_ratios = split_note_ids.length === state.splitNoteIds.length
				? state.splitRatios
				: (split_note_ids.length > 0 ? Array(split_note_ids.length + 1).fill(1 / (split_note_ids.length + 1)) : [])

			const filtered_projects = projects.filter((project) => project_ids.has(project.id))

			return {
				notes,
				projects: filtered_projects,
				tags,
				settings,
				activeFilter,
				selectedNoteId: selected_note_id,
				openTabs: open_tabs,
				drafts,
				untouchedNewNoteIds: untouched_new_note_ids,
				splitNoteIds: split_note_ids,
				splitRatios: split_ratios,
			}
		})
	},

	async refreshTags() {
		set({ tags: await notesService.listTags() })
	},

	setSearchQuery(searchQuery) {
		set({ searchQuery })
	},

	setActiveFilter(activeFilter) {
		set({ activeFilter, selectedTag: null })
	},

	setSelectedTag(selectedTag) {
		set({ selectedTag, activeFilter: 'all' })
	},

	selectNote(selectedNoteId) {
		set({ selectedNoteId })
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
	},

	closeTab(id) {
		const state = get()
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
		const split_ratios = split_note_ids.length === state.splitNoteIds.length
			? state.splitRatios
			: (split_note_ids.length > 0 ? Array(split_note_ids.length + 1).fill(1 / (split_note_ids.length + 1)) : [])
		set({ openTabs: tabs, selectedNoteId: next, drafts, untouchedNewNoteIds: untouched_new_note_ids, splitNoteIds: split_note_ids, splitRatios: split_ratios })
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
	},

	navigateForward() {
		const state = get()
		const forward = [...state.navigationForwardStack]
		if (0 === forward.length) return
		const next = forward.pop()!
		const back = [...state.navigationBackStack, state.selectedNoteId!]
		if (back.length > 80) back.shift()
		set({ selectedNoteId: next, navigationBackStack: back, navigationForwardStack: forward })
	},

	async createNote() {
		const note = await notesService.create()
		set((state) => ({
			notes: [note, ...state.notes],
			selectedNoteId: note.id, openTabs: [...state.openTabs, note.id],
			drafts: { ...state.drafts, [note.id]: note.content },
			untouchedNewNoteIds: { ...state.untouchedNewNoteIds, [note.id]: true },
			saveState: 'saved',
			lastSavedAt: note.updatedAt,
		}))
		await get().refreshTags()
	},

	setDraft(id, content) {
		set((state) => {
			const untouched_new_note_ids = { ...state.untouchedNewNoteIds }
			if (untouched_new_note_ids[id] && !is_effectively_untouched_content(content)) {
				delete untouched_new_note_ids[id]
			}

			let drafts = { ...state.drafts, [id]: content }
			const draft_keys = Object.keys(drafts)
			if (draft_keys.length > MAX_DRAFTS) {
				const protected_ids = new Set([...state.openTabs, ...state.splitNoteIds, state.selectedNoteId].filter(Boolean) as string[])
				// Evict the first draft whose id is not protected
				for (const key of draft_keys) {
					if (!protected_ids.has(key)) {
						const next_drafts = { ...drafts }
						delete next_drafts[key]
						drafts = next_drafts
						break
					}
				}
			}

			return {
				drafts,
				untouchedNewNoteIds: untouched_new_note_ids,
				saveState: 'saving',
			}
		})
	},

	async flushDraft(id, options) {
		const state = get()
		const draft = state.drafts[id]
		if ('string' !== typeof draft) return

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
			if (await notesService.delete(id)) {
				set((current) => {
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
						saveState: 'saved',
					}
				})
				await get().refreshTags()
			}
			return
		}

		try {
			const updated = await notesService.update(id, { content: draft })
			if (!updated) return
			set((current) => {
				const untouched_new_note_ids = { ...current.untouchedNewNoteIds }
				if (untouched_new_note_ids[id] && !is_effectively_untouched_content(draft)) {
					delete untouched_new_note_ids[id]
				}
				return {
					notes: current.notes.map((item) => (item.id === id ? updated : item)),
					untouchedNewNoteIds: untouched_new_note_ids,
					saveState: 'saved',
					lastSavedAt: updated.updatedAt,
				}
			})
		} catch {
			set({ saveState: 'failed' })
		}
	},

	async toggleStar(id) {
		const current = get().notes.find((note) => note.id === id)
		if (!current) return
		const updated = await notesService.star(id, !current.starred)
		if (!updated) return
		set((state) => ({ notes: state.notes.map((note) => (note.id === id ? updated : note)) }))
	},

	async toggleArchive(id) {
		const current = get().notes.find((note) => note.id === id)
		if (!current) return
		const updated = await notesService.archive(id, !current.archived)
		if (!updated) return
		set((state) => ({ notes: state.notes.map((note) => (note.id === id ? updated : note)) }))
		await get().refreshTags()
	},

	async deleteSelected() {
		const id = get().selectedNoteId
		if (!id) return null
		const deleted_note = get().notes.find((note) => note.id === id) ?? null
		if (!(await notesService.delete(id))) return null
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
				selectedNoteId: notes[0]?.id ?? null, openTabs: state.openTabs.filter((t) => t !== id), navigationBackStack: state.navigationBackStack.filter((t) => t !== id), navigationForwardStack: state.navigationForwardStack.filter((t) => t !== id),
				splitNoteIds: state.splitNoteIds.filter((nid) => nid !== id),
				splitRatios: state.splitNoteIds.filter((nid) => nid !== id).length !== state.splitNoteIds.length
					? (state.splitNoteIds.filter((nid) => nid !== id).length > 0 ? Array(state.splitNoteIds.filter((nid) => nid !== id).length + 1).fill(1 / (state.splitNoteIds.filter((nid) => nid !== id).length + 1)) : [])
					: state.splitRatios,
			}
		})
		await get().refreshTags()
		return deleted_note
	},

	async restoreDeletedNote(id) {
		const restored = await notesService.restore(id)
		if (!restored) return false
		set((state) => ({
			notes: [restored, ...state.notes.filter((note) => note.id !== restored.id)],
			selectedNoteId: restored.id,
			drafts: { ...state.drafts, [restored.id]: restored.content },
			saveState: 'saved',
			lastSavedAt: restored.updatedAt,
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
		const updated = await notesService.update(id, { tags: normalized })
		if (!updated) return
		set((state) => ({ notes: state.notes.map((note) => (note.id === id ? updated : note)) }))
		await get().refreshTags()
	},

	async setProjectForNote(id, projectId) {
		const updated = await notesService.update(id, { projectId })
		if (!updated) return
		set((state) => ({ notes: state.notes.map((note) => (note.id === id ? updated : note)) }))
	},

	setShowSettings(showSettings) {
		set({ showSettings })
	},

	setShowFiltersPanel(showFiltersPanel) {
		set({ showFiltersPanel })
	},

	async updateSettings(patch) {
		set({ settings: await settingsService.set(patch) })
	},

	filteredNotes() {
		const state = get()
		const project_names_by_id = Object.fromEntries(state.projects.map((project) => [project.id, project.name]))
		return applyFiltersAndSort(state.notes, {
			activeFilter: state.activeFilter,
			selectedTag: state.selectedTag,
			searchQuery: state.searchQuery,
			sortMode: state.settings.sortMode,
		}, project_names_by_id)
	},

	selectedNote() {
		const state = get()
		return state.selectedNoteId ? state.notes.find((note) => note.id === state.selectedNoteId) ?? null : null
	},

	effectiveContent() {
		const state = get()
		if (!state.selectedNoteId) return ''
		return state.drafts[state.selectedNoteId] ?? state.notes.find((note) => note.id === state.selectedNoteId)?.content ?? ''
	},
}))
