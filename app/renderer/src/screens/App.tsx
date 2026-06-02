import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorPane } from '@renderer/src/components/EditorPane'
import { Sidebar } from '@renderer/src/components/Sidebar'
import { TabBar } from '@renderer/src/components/TabBar'
import { SettingsModal } from '@renderer/src/components/SettingsModal'
import { CommandPalette, type PaletteMode } from '@renderer/src/components/CommandPalette'
import { TagsModal } from '@renderer/src/components/TagsModal'
import { RelatedNotesModal } from '@renderer/src/components/RelatedNotesModal'
import { useAppStore } from '@renderer/src/state/useAppStore'
import type { UiCommand } from '@renderer/src/utils/commands'
import { deriveNoteTitle } from '@renderer/src/domain/noteUtils'
import { CircleChevronRightIcon, CirclePlusIcon } from '@renderer/src/components/icons'
import type { HotkeysSettings } from '@shared/hotkeys'
import { DEFAULT_HOTKEYS } from '@shared/hotkeys'

const isMac = navigator.userAgent.includes('Mac')

interface ParsedHotkey {
	useCmd: boolean
	useCtrl: boolean
	useShift: boolean
	useAlt: boolean
	key: string
}

const normalize_hotkey_token = (token: string): string => token.trim().toLowerCase()

const normalize_hotkey_key = (raw_key: string): string => {
	const key = raw_key.trim().toLowerCase()
	if ('backspace' === key || 'delete' === key || '⌫' === key || 'del' === key) return 'backspace'
	if ('bracketleft' === key) return '['
	if ('bracketright' === key) return ']'
	if ('space' === key || ' ' === key) return 'space'
	if (1 === key.length) return key
	return key
}

const parse_hotkey = (hotkey: string): ParsedHotkey | null => {
	const tokens = hotkey.split('+').map((token) => token.trim()).filter(Boolean)
	if (0 === tokens.length) return null

	const parsed: ParsedHotkey = {
		useCmd: false,
		useCtrl: false,
		useShift: false,
		useAlt: false,
		key: '',
	}

	for (let i = 0; i < tokens.length; i++) {
		const token = normalize_hotkey_token(tokens[i])
		if ('cmd' === token || 'command' === token || 'meta' === token || '⌘' === token) {
			parsed.useCmd = true
			continue
		}
		if ('ctrl' === token || 'control' === token || '⌃' === token) {
			parsed.useCtrl = true
			continue
		}
		if ('shift' === token || '⇧' === token) {
			parsed.useShift = true
			continue
		}
		if ('alt' === token || 'option' === token || 'opt' === token || '⌥' === token) {
			parsed.useAlt = true
			continue
		}
		parsed.key = normalize_hotkey_key(token)
	}

	if (!parsed.key) return null
	return parsed
}

const hotkey_matches = (event: KeyboardEvent, hotkey: string): boolean => {
	const parsed = parse_hotkey(hotkey)
	if (!parsed) return false

	const expected_meta = isMac && parsed.useCmd
	const expected_ctrl = parsed.useCtrl || (!isMac && parsed.useCmd)

	if (event.metaKey !== expected_meta) return false
	if (event.ctrlKey !== expected_ctrl) return false
	if (event.shiftKey !== parsed.useShift) return false
	if (event.altKey !== parsed.useAlt) return false

	return normalize_hotkey_key(event.key) === parsed.key
}

const applyThemeClass = (theme: 'dark' | 'light' | 'system') => {
	if ('system' === theme) {
		theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
	}
	document.body.classList.remove('theme-dark', 'theme-light')
	document.body.classList.add('light' === theme ? 'theme-light' : 'theme-dark')
}

export function App() {
	const store = useAppStore()
	const load = useAppStore((state) => state.load)
	const [undoDelete, setUndoDelete] = useState<{ id: string; title: string } | null>(null)
	const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
	const [sidebarWidth, setSidebarWidth] = useState(245)
	const [undoTimeoutId, setUndoTimeoutId] = useState<number | null>(null)
	const [paletteMode, setPaletteMode] = useState<PaletteMode | null>(null)
	const [showRelatedNotes, setShowRelatedNotes] = useState(false)
	const [showTagsModal, setShowTagsModal] = useState(false)
	const [relatedNotes, setRelatedNotes] = useState<Array<{ note: import('@shared/types').Note; reason: string; score: number }>>([])
	const hotkeys: HotkeysSettings = useMemo(() => ({ ...DEFAULT_HOTKEYS, ...(store.settings.hotkeys ?? {}) }), [store.settings.hotkeys])
	const clearUndoToast = useCallback(() => {
		if (null !== undoTimeoutId) {
			window.clearTimeout(undoTimeoutId)
		}
		setUndoTimeoutId(null)
		setUndoDelete(null)
	}, [undoTimeoutId])

	useEffect(() => {
		void load()
	}, [load])

	useEffect(() => {
		document.body.classList.toggle('platform-mac', isMac)
		return () => document.body.classList.remove('platform-mac')
	}, [])

	useEffect(() => {
		applyThemeClass(store.settings.theme)
	}, [store.settings.theme])

	const notes = store.filteredNotes()

	const splitNoteIds = store.splitNoteIds
	const pinnedNotes = useMemo(() => splitNoteIds.map((id) => {
		const note = store.notes.find((n) => n.id === id) ?? null
		return {
			id,
			note,
			content: store.drafts[id] ?? note?.content ?? '',
		}
	}), [splitNoteIds, store.notes, store.drafts])

	const splitRatios = useMemo(() => {
		if (store.splitRatios.length === splitNoteIds.length + 1) return store.splitRatios
		if (splitNoteIds.length === 0) return []
		return Array(splitNoteIds.length + 1).fill(1 / (splitNoteIds.length + 1))
	}, [store.splitRatios, splitNoteIds.length])

	const startSplitResize = (resizerIndex: number) => (event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault()
		const start_x = event.clientX
		const target = event.target as HTMLElement
		const leftPane = target.previousElementSibling as HTMLElement | null
		const rightPane = target.nextElementSibling as HTMLElement | null
		if (!leftPane || !rightPane) return
		const leftWidth = leftPane.getBoundingClientRect().width
		const rightWidth = rightPane.getBoundingClientRect().width
		const pairWidth = leftWidth + rightWidth
		const ratios = splitRatios
		if (resizerIndex < 0 || resizerIndex >= ratios.length - 1) return
		const startPairTotal = ratios[resizerIndex] + ratios[resizerIndex + 1]
		const startLeftFrac = startPairTotal > 0 ? ratios[resizerIndex] / startPairTotal : 0.5

		const onMouseMove = (move_event: MouseEvent) => {
			const delta = move_event.clientX - start_x
			const nextFrac = startLeftFrac + delta / pairWidth
			store.setSplitResizeRatio(resizerIndex, nextFrac)
		}

		const onMouseUp = () => {
			window.removeEventListener('mousemove', onMouseMove)
			window.removeEventListener('mouseup', onMouseUp)
		}

		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', onMouseUp)
	}

	const onDelete = useCallback(async (id: string) => {
		if (store.selectedNoteId !== id) store.selectNote(id)
		const deleted = await store.deleteSelected()
		if (!deleted) return
		if (null !== undoTimeoutId) {
			window.clearTimeout(undoTimeoutId)
		}
		setUndoDelete({ id: deleted.id, title: deriveNoteTitle(deleted.content) })
		setUndoTimeoutId(window.setTimeout(() => {
			setUndoDelete(null)
			setUndoTimeoutId(null)
		}, 5000))
	}, [store, undoTimeoutId])

	const undoLastDelete = useCallback(async () => {
		if (!undoDelete) return
		await store.restoreDeletedNote(undoDelete.id)
		clearUndoToast()
	}, [clearUndoToast, store, undoDelete])

	const openNoteFromChat = useCallback(async (note_id: string, new_tab = false) => {
		const target_note = store.notes.find((candidate) => candidate.id === note_id)
		if (!target_note) return

		if (store.selectedNoteId && store.selectedNoteId !== note_id) {
			await store.flushDraft(store.selectedNoteId, { allowDiscardUntouchedEmpty: true })
		}

		if (new_tab) {
			store.openNoteInTab(note_id)
		} else {
			store.selectNote(note_id)
		}
	}, [store])

	const runCommand = useCallback(async (command: UiCommand) => {
		if ('new-note' === command) return store.createNote()
		if ('focus-search' === command) return window.dispatchEvent(new CustomEvent('strata:focus-search'))
		if ('save-note' === command && store.selectedNoteId) return store.flushDraft(store.selectedNoteId)
		if ('toggle-star' === command && store.selectedNoteId) return store.toggleStar(store.selectedNoteId)
		if ('toggle-archive' === command && store.selectedNoteId) return store.toggleArchive(store.selectedNoteId)
		if ('toggle-filters' === command) return store.setShowFiltersPanel(!store.showFiltersPanel)
		if ('delete-note' === command && store.selectedNoteId) return onDelete(store.selectedNoteId)
		if ('open-tags-editor' === command) return window.dispatchEvent(new CustomEvent('strata:open-tags-editor'))
		if ('copy-rich-text' === command) return window.dispatchEvent(new CustomEvent('strata:copy-rich-text'))
	}, [onDelete, store])

	const startSidebarResize = (event: React.MouseEvent<HTMLDivElement>) => {
		if (sidebarCollapsed) return
		event.preventDefault()
		const start_x = event.clientX
		const start_width = sidebarWidth

		const onMouseMove = (move_event: MouseEvent) => {
			const next_width = start_width + (move_event.clientX - start_x)
			setSidebarWidth(Math.min(560, Math.max(220, next_width)))
		}

		const onMouseUp = () => {
			window.removeEventListener('mousemove', onMouseMove)
			window.removeEventListener('mouseup', onMouseUp)
		}

		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', onMouseUp)
	}

	useEffect(() => {
		const unsubscribe = window.strata.onCommand((command) => {
			void runCommand(command as UiCommand)
		})
		return unsubscribe
	}, [runCommand])

	useEffect(() => {
		const unsubscribe = window.strata.onNotesChanged(() => {
			void load()
		})
		return unsubscribe
	}, [load])

	useEffect(() => {
		const onKeyDown = async (event: KeyboardEvent) => {
			if (!event.metaKey && !event.ctrlKey) {
				if ('Escape' === event.key) {
					if (paletteMode) {
						setPaletteMode(null)
						return
					}
					store.setShowSettings(false)
				}
				return
			}

			const pinned_tags = store.settings.pinnedTags ?? []
			for (let i = 0; i < 9; i++) {
				if (!hotkey_matches(event, `Cmd+${i + 1}`)) continue
				event.preventDefault()
				const tag = pinned_tags[i]
				if (tag) store.setSelectedTag(store.selectedTag === tag ? null : tag)
				return
			}

			if (hotkey_matches(event, hotkeys.togglePreview)) {
				event.preventDefault()
				window.dispatchEvent(new CustomEvent('strata:toggle-preview'))
				return
			}

			if (hotkey_matches(event, hotkeys.quickOpen)) {
				event.preventDefault()
				setPaletteMode('quick-open')
				return
			}
			if (hotkey_matches(event, hotkeys.commandPalette)) {
				event.preventDefault()
				setPaletteMode('commands')
				return
			}
			if (hotkey_matches(event, hotkeys.relatedNotes)) {
				event.preventDefault()
				if (store.selectedNoteId) {
					window.strata.links.relatedNotes(store.selectedNoteId).then(setRelatedNotes).catch(() => setRelatedNotes([]))
					setShowRelatedNotes(true)
				}
				return
			}
			if (hotkey_matches(event, hotkeys.toggleSidebar)) {
				event.preventDefault()
				setSidebarCollapsed((v) => !v)
				return
			}
			if (hotkey_matches(event, hotkeys.toggleSettings)) {
				event.preventDefault()
				store.setShowSettings(true)
				return
			}
			if (hotkey_matches(event, hotkeys.navigateBack)) {
				event.preventDefault()
				if (store.selectedNoteId) await store.flushDraft(store.selectedNoteId, { allowDiscardUntouchedEmpty: true })
				store.navigateBack()
				return
			}
			if (hotkey_matches(event, hotkeys.navigateForward)) {
				event.preventDefault()
					if (store.selectedNoteId) await store.flushDraft(store.selectedNoteId, { allowDiscardUntouchedEmpty: true })
					store.navigateForward()
					return
			}
			if (hotkey_matches(event, hotkeys.newNote)) {
				event.preventDefault()
				void runCommand('new-note')
				return
			}
			if (hotkey_matches(event, hotkeys.allTagsModal)) {
				event.preventDefault()
				setShowTagsModal(true)
				return
			}
			if (hotkey_matches(event, hotkeys.findOrSearch)) {
				event.preventDefault()
				const active_element = document.activeElement
				const editor_focused = active_element instanceof HTMLElement && Boolean(active_element.closest('.cm-editor, .cm-content, .cm-scroller'))
				if (editor_focused) {
					window.dispatchEvent(new CustomEvent('strata:toggle-inline-find'))
				} else {
					void runCommand('focus-search')
				}
				return
			}
			if (hotkey_matches(event, hotkeys.toggleFilters)) {
				event.preventDefault()
				void runCommand('toggle-filters')
				return
			}
			if (hotkey_matches(event, hotkeys.saveNote)) {
				event.preventDefault()
				void runCommand('save-note')
				return
			}
			if (hotkey_matches(event, hotkeys.toggleStar)) {
				event.preventDefault()
				void runCommand('toggle-star')
				return
			}
			if (hotkey_matches(event, hotkeys.toggleArchive)) {
				event.preventDefault()
				void runCommand('toggle-archive')
				return
			}
			if (hotkey_matches(event, hotkeys.editNoteTags)) {
				event.preventDefault()
				void runCommand('open-tags-editor')
				return
			}
			if (hotkey_matches(event, hotkeys.copyRichText)) {
				const active_element = document.activeElement
				const editor_focused = active_element instanceof HTMLElement && Boolean(active_element.closest('.cm-editor, .cm-content, .cm-scroller'))
				if (editor_focused) {
					event.preventDefault()
					void runCommand('copy-rich-text')
				}
				return
			}
			if (hotkey_matches(event, hotkeys.deleteNote)) {
				event.preventDefault()
				void runCommand('delete-note')
				return
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [runCommand, store, paletteMode, hotkeys])

	useEffect(() => {
		return () => {
			if (null !== undoTimeoutId) {
				window.clearTimeout(undoTimeoutId)
			}
		}
	}, [undoTimeoutId])

	// Drag-and-drop .md file import
	useEffect(() => {
		const onDragOver = (event: DragEvent) => {
			event.preventDefault()
			event.stopPropagation()
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'copy'
			}
			document.body.classList.add('drag-over')
		}

		const onDragLeave = (event: DragEvent) => {
			event.preventDefault()
			event.stopPropagation()
			// Only remove class when leaving the document body
			if (event.target === document.body || event.target === document.documentElement) {
				document.body.classList.remove('drag-over')
			}
		}

		const onDrop = async (event: DragEvent) => {
			event.preventDefault()
			event.stopPropagation()
			document.body.classList.remove('drag-over')

			const files = event.dataTransfer?.files
			if (!files || 0 === files.length) return

			const file = files[0]
			if (!file.name.endsWith('.md')) return

			try {
				const text = await file.text()
				const firstLine = text.trimStart().split('\n')[0] || ''
				const hasHeading = firstLine.startsWith('# ')
				const title = hasHeading ? firstLine.slice(2).trim() : file.name.replace(/\.md$/i, '')
				const content = hasHeading ? text : `# ${title}\n\n${text}`

				// Create note directly via API to avoid draft-system race conditions
				const note = await window.strata.notes.create()
				await window.strata.notes.update(note.id, { content })
				await store.load()
				store.openNoteInTab(note.id)
			} catch (err) {
				console.error('Failed to import markdown file', err)
			}
		}

		document.addEventListener('dragover', onDragOver)
		document.addEventListener('dragleave', onDragLeave)
		document.addEventListener('drop', onDrop)

		return () => {
			document.removeEventListener('dragover', onDragOver)
			document.removeEventListener('dragleave', onDragLeave)
			document.removeEventListener('drop', onDrop)
			document.body.classList.remove('drag-over')
		}
	}, [store])

	return (
		<div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
			{sidebarCollapsed && createPortal(
				<>
					<button
						className="standalone-sidebar-toggle"
						onClick={() => setSidebarCollapsed(false)}
						title="Open Sidebar"
						aria-label="Open Sidebar"
					>
						<CircleChevronRightIcon />
					</button>
					<button
						className="standalone-new-note"
						onClick={() => void store.createNote()}
						title="New Note"
						aria-label="New Note"
					>
						<CirclePlusIcon size={18} />
					</button>
				</>,
				document.body
			)}
			<div className="workspace-layout" style={{ gridTemplateColumns: sidebarCollapsed ? 'minmax(0, 1fr)' : `${sidebarWidth}px 3px minmax(0, 1fr)` }}>
				<Sidebar
					notes={notes}
					selectedId={store.selectedNoteId}
					activeFilter={store.activeFilter}
					selectedTag={store.selectedTag}
					searchQuery={store.searchQuery}
					tags={store.tags}
					showFiltersPanel={store.showFiltersPanel}
					sidebarCollapsed={sidebarCollapsed}
					pinnedTags={store.settings.pinnedTags ?? []}
					onSearchChange={store.setSearchQuery}
					onSelect={async (id) => {
						if (store.selectedNoteId && store.selectedNoteId !== id) await store.flushDraft(store.selectedNoteId, { allowDiscardUntouchedEmpty: true })
						store.openNoteInTab(id)
					}}
					onNewNote={() => void store.createNote()}
					onOpenSettings={() => store.setShowSettings(true)}
					onThemeToggle={() => void store.updateSettings({ theme: 'dark' === store.settings.theme ? 'light' : 'dark' })}
					onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
					onOpenTagsModal={() => setShowTagsModal(true)}
					onFilterChange={store.setActiveFilter}
					onTagFilter={(tag) => store.setSelectedTag(store.selectedTag === tag ? null : tag)}
					onStarToggle={(id) => void store.toggleStar(id)}
					onArchiveToggle={(id) => void store.toggleArchive(id)}
					onDelete={(id) => void onDelete(id)}
					onPinTag={(tag) => {
						const current = store.settings.pinnedTags ?? []
						if (!current.includes(tag)) store.updateSettings({ pinnedTags: [...current, tag] })
					}}
					onUnpinTag={(tag) => {
						const current = store.settings.pinnedTags ?? []
						store.updateSettings({ pinnedTags: current.filter((t) => t !== tag) })
					}}
					onReorderPinned={(tags) => store.updateSettings({ pinnedTags: tags })}
					undoDeleteTitle={undoDelete?.title ?? null}
					onUndoDelete={() => void undoLastDelete()}
					theme={store.settings.theme}
				/>
				{!sidebarCollapsed && <div className="panel-resizer panel-resizer-sidebar" onMouseDown={startSidebarResize} role="separator" aria-orientation="vertical" aria-label="Resize sidebar" />}
				<div className={`editor-column${(store.openTabs.length > 1 || splitNoteIds.length > 0) ? ' has-tabs' : ''}${splitNoteIds.length > 0 ? ' editor-column-split' : ''}`}>
					<TabBar
						tabs={store.openTabs}
						activeTabId={store.selectedNoteId}
						notes={store.notes}
						drafts={store.drafts}
						splitNoteIds={splitNoteIds}
						splitLayout={store.splitLayout}
						splitGridColumns={store.splitGridColumns}
						onSelectTab={async (id) => {
							if (store.selectedNoteId && store.selectedNoteId !== id) {
								await store.flushDraft(store.selectedNoteId, { allowDiscardUntouchedEmpty: true })
							}
							store.activateTab(id)
						}}
						onCloseTab={(id) => store.closeTab(id)}
						onReorderTabs={(from_id, to_id) => store.reorderTabs(from_id, to_id)}
						onSplitNote={(id) => store.toggleSplitNote(id)}
						onSetSplitLayout={(layout) => store.setSplitLayout(layout)}
						onSetSplitGridColumns={(cols) => store.setSplitGridColumns(cols)}
					/>
					{splitNoteIds.length > 0 ? (
						'grid' === store.splitLayout ? (
							<div
								className="split-panes split-panes-grid"
								style={{ gridTemplateColumns: `repeat(${store.splitGridColumns}, 1fr)` }}
							>
								{pinnedNotes.map((pinned) => (
									<div className="split-pane" key={`pinned-${pinned.id}`}>
										<EditorPane
											note={pinned.note}
											notes={store.notes}
											openTabIds={store.openTabs}
											drafts={store.drafts}
											openAiModel={store.settings.openAiModel}
											content={pinned.content}
											tags={store.tags}
											saveState={store.saveState}
											lastSavedAt={store.lastSavedAt}
											sidebarCollapsed={sidebarCollapsed}
											theme={store.settings.theme}
											onChangeDraft={store.setDraft}
											onFlush={store.flushDraft}
											onToggleStar={(id) => void store.toggleStar(id)}
											onToggleArchive={(id) => void store.toggleArchive(id)}
											onDelete={(id) => void onDelete(id)}
											onSetTags={(tags) => { void store.setTagsForNote(pinned.id, tags) }}
											onOpenNoteFromChat={openNoteFromChat}
											onShowRelatedNotes={() => {
												window.strata.links.relatedNotes(pinned.id).then(setRelatedNotes).catch(() => setRelatedNotes([]))
												setShowRelatedNotes(true)
											}}
											onOpenSettings={() => store.setShowSettings(true)}
											onThemeToggle={() => void store.updateSettings({ theme: 'dark' === store.settings.theme ? 'light' : 'dark' })}
										/>
									</div>
								))}
								<div className="split-pane">
					<EditorPane
					note={store.selectedNote()}
					notes={store.notes}
					openTabIds={store.openTabs}
					drafts={store.drafts}
					openAiModel={store.settings.openAiModel}
					content={store.effectiveContent()}
					tags={store.tags}
					saveState={store.saveState}
					lastSavedAt={store.lastSavedAt}
					sidebarCollapsed={sidebarCollapsed}
					theme={store.settings.theme}
					onChangeDraft={store.setDraft}
					onFlush={store.flushDraft}
					onToggleStar={(id) => void store.toggleStar(id)}
					onToggleArchive={(id) => void store.toggleArchive(id)}
					onDelete={(id) => void onDelete(id)}
					onSetTags={(tags) => void store.setTagsForSelected(tags)}
					onOpenNoteFromChat={openNoteFromChat}
					onShowRelatedNotes={() => {
						if (store.selectedNoteId) {
							window.strata.links.relatedNotes(store.selectedNoteId).then(setRelatedNotes).catch(() => setRelatedNotes([]))
							setShowRelatedNotes(true)
						}
					}}
					onOpenSettings={() => store.setShowSettings(true)}
					onThemeToggle={() => void store.updateSettings({ theme: 'dark' === store.settings.theme ? 'light' : 'dark' })}
				/>
								</div>
							</div>
						) : (
							<div
								className="split-panes"
								style={{ gridTemplateColumns: splitRatios.map((r, i) => i === splitRatios.length - 1 ? `${(r * 100).toFixed(1)}%` : `${(r * 100).toFixed(1)}% 3px`).join(' ') }}
							>
								{pinnedNotes.map((pinned, i) => (
									<Fragment key={`pinned-${pinned.id}`}>
										<div className="split-pane">
											<EditorPane
												note={pinned.note}
												notes={store.notes}
												openTabIds={store.openTabs}
												drafts={store.drafts}
												openAiModel={store.settings.openAiModel}
												content={pinned.content}
												tags={store.tags}
												saveState={store.saveState}
												lastSavedAt={store.lastSavedAt}
												sidebarCollapsed={sidebarCollapsed}
												theme={store.settings.theme}
												onChangeDraft={store.setDraft}
												onFlush={store.flushDraft}
												onToggleStar={(id) => void store.toggleStar(id)}
												onToggleArchive={(id) => void store.toggleArchive(id)}
												onDelete={(id) => void onDelete(id)}
												onSetTags={(tags) => { void store.setTagsForNote(pinned.id, tags) }}
												onOpenNoteFromChat={openNoteFromChat}
												onShowRelatedNotes={() => {
													window.strata.links.relatedNotes(pinned.id).then(setRelatedNotes).catch(() => setRelatedNotes([]))
													setShowRelatedNotes(true)
												}}
												onOpenSettings={() => store.setShowSettings(true)}
												onThemeToggle={() => void store.updateSettings({ theme: 'dark' === store.settings.theme ? 'light' : 'dark' })}
											/>
										</div>
										<div
											className="panel-resizer panel-resizer-split"
											onMouseDown={startSplitResize(i)}
											role="separator"
											aria-orientation="vertical"
											aria-label="Resize split panes"
										/>
									</Fragment>
								))}
								<div className="split-pane">
					<EditorPane
					note={store.selectedNote()}
					notes={store.notes}
					openTabIds={store.openTabs}
					drafts={store.drafts}
					openAiModel={store.settings.openAiModel}
					content={store.effectiveContent()}
					tags={store.tags}
					saveState={store.saveState}
					lastSavedAt={store.lastSavedAt}
					sidebarCollapsed={sidebarCollapsed}
					theme={store.settings.theme}
					onChangeDraft={store.setDraft}
					onFlush={store.flushDraft}
					onToggleStar={(id) => void store.toggleStar(id)}
					onToggleArchive={(id) => void store.toggleArchive(id)}
					onDelete={(id) => void onDelete(id)}
					onSetTags={(tags) => void store.setTagsForSelected(tags)}
					onOpenNoteFromChat={openNoteFromChat}
					onShowRelatedNotes={() => {
						if (store.selectedNoteId) {
							window.strata.links.relatedNotes(store.selectedNoteId).then(setRelatedNotes).catch(() => setRelatedNotes([]))
							setShowRelatedNotes(true)
						}
					}}
					onOpenSettings={() => store.setShowSettings(true)}
					onThemeToggle={() => void store.updateSettings({ theme: 'dark' === store.settings.theme ? 'light' : 'dark' })}
				/>
								</div>
							</div>
						)
					) : (
					<EditorPane
					note={store.selectedNote()}
					notes={store.notes}
					openTabIds={store.openTabs}
					drafts={store.drafts}
					openAiModel={store.settings.openAiModel}
					content={store.effectiveContent()}
					tags={store.tags}
					saveState={store.saveState}
					lastSavedAt={store.lastSavedAt}
					sidebarCollapsed={sidebarCollapsed}
					theme={store.settings.theme}
					onChangeDraft={store.setDraft}
					onFlush={store.flushDraft}
					onToggleStar={(id) => void store.toggleStar(id)}
					onToggleArchive={(id) => void store.toggleArchive(id)}
					onDelete={(id) => void onDelete(id)}
					onSetTags={(tags) => void store.setTagsForSelected(tags)}
					onOpenNoteFromChat={openNoteFromChat}
					onShowRelatedNotes={() => {
						if (store.selectedNoteId) {
							window.strata.links.relatedNotes(store.selectedNoteId).then(setRelatedNotes).catch(() => setRelatedNotes([]))
							setShowRelatedNotes(true)
						}
					}}
					onOpenSettings={() => store.setShowSettings(true)}
					onThemeToggle={() => void store.updateSettings({ theme: 'dark' === store.settings.theme ? 'light' : 'dark' })}
				/>
					)}
				</div>
			</div>
			<SettingsModal
				open={store.showSettings}
				settings={store.settings}
				onClose={() => store.setShowSettings(false)}
				onUpdate={(patch) => void store.updateSettings(patch)}
				onCreateBackup={async () => {
					const result = await window.strata.backups.createNow()
					await store.updateSettings({ lastAutoBackupAt: result.createdAt })
					return result
				}}
				onOpenBackupsFolder={async () => {
					await window.strata.backups.openFolder()
				}}
				onListBackups={async () => {
					return await window.strata.backups.listRecent()
				}}
			/>
			{paletteMode && (
				<CommandPalette
					mode={paletteMode}
					notes={store.notes}
					selectedNoteId={store.selectedNoteId}
					onClose={() => setPaletteMode(null)}
					onOpenNote={async (id) => {
						if (store.selectedNoteId && store.selectedNoteId !== id) await store.flushDraft(store.selectedNoteId, { allowDiscardUntouchedEmpty: true })
						store.openNoteInTab(id)
					}}
					onRunCommand={(cmd) => void runCommand(cmd)}
					onTogglePreview={() => window.dispatchEvent(new CustomEvent('strata:toggle-preview'))}
					onToggleChatPanel={() => window.dispatchEvent(new CustomEvent('strata:toggle-chat-panel'))}
					onOpenSettings={() => store.setShowSettings(true)}
				/>
			)}
			<RelatedNotesModal
				open={showRelatedNotes}
				relatedNotes={relatedNotes}
				onClose={() => setShowRelatedNotes(false)}
				onOpenNote={(note_id, new_tab) => {
					void openNoteFromChat(note_id, new_tab)
					setShowRelatedNotes(false)
				}}
			/>
			<TagsModal
				key={showTagsModal ? 'tags-modal-open' : 'tags-modal-closed'}
				open={showTagsModal}
				tags={store.tags}
				pinnedTags={store.settings.pinnedTags ?? []}
				selectedTag={store.selectedTag}
				onClose={() => setShowTagsModal(false)}
				onSelectTag={(tag) => store.setSelectedTag(tag)}
				onPinTag={(tag) => {
					const current = store.settings.pinnedTags ?? []
					if (!current.includes(tag)) store.updateSettings({ pinnedTags: [...current, tag] })
				}}
				onUnpinTag={(tag) => {
					const current = store.settings.pinnedTags ?? []
					store.updateSettings({ pinnedTags: current.filter((t) => t !== tag) })
				}}
			/>
		</div>
	)
}
