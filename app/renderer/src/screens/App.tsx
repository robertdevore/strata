import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorPane } from '@renderer/src/components/EditorPane'
import { Sidebar } from '@renderer/src/components/Sidebar'
import { TabBar } from '@renderer/src/components/TabBar'
import { ConfirmModal } from '@renderer/src/components/ConfirmModal'
import { SettingsModal } from '@renderer/src/components/SettingsModal'
import { CommandPalette, type PaletteMode } from '@renderer/src/components/CommandPalette'
import { RelatedNotesModal } from '@renderer/src/components/RelatedNotesModal'
import { useAppStore } from '@renderer/src/state/useAppStore'
import type { UiCommand } from '@renderer/src/utils/commands'
import { deriveNoteTitle } from '@renderer/src/domain/noteUtils'
import { CircleChevronRightIcon, PlusIcon } from '@renderer/src/components/icons'

const isMac = navigator.userAgent.includes('Mac')

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
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
	const [undoDelete, setUndoDelete] = useState<{ id: string; title: string } | null>(null)
	const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
	const [sidebarWidth, setSidebarWidth] = useState(270)
	const [undoTimeoutId, setUndoTimeoutId] = useState<number | null>(null)
	const [paletteMode, setPaletteMode] = useState<PaletteMode | null>(null)
	const [showRelatedNotes, setShowRelatedNotes] = useState(false)
	const [relatedNotes, setRelatedNotes] = useState<Array<{ note: import('@shared/types').Note; reason: string; score: number }>>([])
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
		// After initial load, start with a fresh blank note — but only if the
		// newest note isn't already an empty untitled one (avoid duplicates).
		if (store.notes.length > 0 && !store.selectedNoteId && store.openTabs.length === 0) {
			const newest = store.notes[0]
			const is_empty_untitled = !newest.content.trim() || '# Untitled\n\n' === newest.content
			if (!is_empty_untitled) {
				void store.createNote()
			} else {
				store.openNoteInTab(newest.id)
			}
		}
	}, [store.notes, store.selectedNoteId, store.openTabs])

	useEffect(() => {
		document.body.classList.toggle('platform-mac', isMac)
		return () => document.body.classList.remove('platform-mac')
	}, [])

	useEffect(() => {
		applyThemeClass(store.settings.theme)
	}, [store.settings.theme])

	const notes = store.filteredNotes()

	const onDelete = useCallback(async (id: string) => {
		if (store.settings.confirmDelete) {
			setPendingDeleteId(id)
			return
		}
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
			await store.flushDraft(store.selectedNoteId)
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
		const onKeyDown = (event: KeyboardEvent) => {
			const meta = isMac ? event.metaKey : event.ctrlKey
			if (!meta) {
				if ('Escape' === event.key) {
					if (paletteMode) {
						setPaletteMode(null)
						return
					}
					setPendingDeleteId(null)
					store.setShowSettings(false)
				}
				return
			}
			const key = event.key.toLowerCase()
			if ('p' === key && !event.shiftKey) {
					event.preventDefault()
					setPaletteMode('quick-open')
					return
			}
			if ('k' === key && !event.shiftKey) {
					event.preventDefault()
					setPaletteMode('commands')
					return
			}			if ('r' === key && !event.shiftKey) {
				event.preventDefault()
				if (store.selectedNoteId) {
					window.strata.links.relatedNotes(store.selectedNoteId).then(setRelatedNotes).catch(() => setRelatedNotes([]))
					setShowRelatedNotes(true)
				}
				return
			}
			if ('b' === key && event.shiftKey) {
				event.preventDefault()
				setSidebarCollapsed((v) => !v)
				return
			}			if ('[' === event.key) {
					event.preventDefault()
					store.navigateBack()
					return
			}
			if (']' === event.key) {
					event.preventDefault()
					store.navigateForward()
					return
			}
			if ('n' === key) {
				event.preventDefault()
				void runCommand('new-note')
			}
			if ('f' === key && !event.shiftKey) {
				event.preventDefault()
				const active_element = document.activeElement
				const editor_focused = active_element instanceof HTMLElement && Boolean(active_element.closest('.cm-editor, .cm-content, .cm-scroller'))
				if (editor_focused) {
					window.dispatchEvent(new CustomEvent('strata:open-find-replace'))
				} else {
					void runCommand('focus-search')
				}
			}
			if ('f' === key && event.shiftKey) {
				event.preventDefault()
				void runCommand('toggle-filters')
			}
			if ('s' === key && !event.shiftKey) {
				event.preventDefault()
				void runCommand('save-note')
			}
			if ('s' === key && event.shiftKey) {
				event.preventDefault()
				void runCommand('toggle-star')
			}
			if ('a' === key && event.shiftKey) {
				event.preventDefault()
				void runCommand('toggle-archive')
			}
			if ('t' === key && !event.shiftKey) {
				event.preventDefault()
				void runCommand('open-tags-editor')
			}
			if ('c' === key && event.shiftKey) {
				event.preventDefault()
				void runCommand('copy-rich-text')
			}
			if ('Backspace' === event.key) {
				event.preventDefault()
				void runCommand('delete-note')
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [runCommand, store, paletteMode])

	useEffect(() => {
		return () => {
			if (null !== undoTimeoutId) {
				window.clearTimeout(undoTimeoutId)
			}
		}
	}, [undoTimeoutId])

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
						<PlusIcon size={15} />
					</button>
				</>,
				document.body
			)}
			<div className="workspace-layout" style={{ gridTemplateColumns: sidebarCollapsed ? 'minmax(0, 1fr)' : `${sidebarWidth}px 6px minmax(0, 1fr)` }}>
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
						if (store.selectedNoteId && store.selectedNoteId !== id) await store.flushDraft(store.selectedNoteId)
						store.openNoteInTab(id)
					}}
					onNewNote={() => void store.createNote()}
					onOpenSettings={() => store.setShowSettings(true)}
					onThemeToggle={() => void store.updateSettings({ theme: 'dark' === store.settings.theme ? 'light' : 'dark' })}
					onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
					onToggleFiltersPanel={() => store.setShowFiltersPanel(!store.showFiltersPanel)}
					onFilterChange={store.setActiveFilter}
					onTagFilter={store.setSelectedTag}
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
					undoDeleteTitle={undoDelete?.title ?? null}
					onUndoDelete={() => void undoLastDelete()}
					theme={store.settings.theme}
				/>
				{!sidebarCollapsed && <div className="panel-resizer panel-resizer-sidebar" onMouseDown={startSidebarResize} role="separator" aria-orientation="vertical" aria-label="Resize sidebar" />}
				<div className={`editor-column${store.openTabs.length > 1 ? ' has-tabs' : ''}`}>
					<TabBar
						tabs={store.openTabs}
						activeTabId={store.selectedNoteId}
						notes={store.notes}
						drafts={store.drafts}
						onSelectTab={(id) => store.activateTab(id)}
						onCloseTab={(id) => store.closeTab(id)}
					/>
					<EditorPane
					note={store.selectedNote()}
					notes={store.notes}
					openAiModel={store.settings.openAiModel}
					content={store.effectiveContent()}
					tags={store.tags}
					saveState={store.saveState}
					lastSavedAt={store.lastSavedAt}
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
				/>
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
			<ConfirmModal
				open={Boolean(pendingDeleteId)}
				title="Delete note"
				message="This note will be removed. You can undo for a few seconds."
				onCancel={() => setPendingDeleteId(null)}
				onConfirm={async () => {
					if (pendingDeleteId && store.selectedNoteId !== pendingDeleteId) store.selectNote(pendingDeleteId)
					const deleted = await store.deleteSelected()
					if (deleted) {
						if (null !== undoTimeoutId) {
							window.clearTimeout(undoTimeoutId)
						}
						setUndoDelete({ id: deleted.id, title: deriveNoteTitle(deleted.content) })
						setUndoTimeoutId(window.setTimeout(() => {
							setUndoDelete(null)
							setUndoTimeoutId(null)
						}, 5000))
					}
					setPendingDeleteId(null)
				}}
			/>
			{paletteMode && (
				<CommandPalette
					mode={paletteMode}
					notes={store.notes}
					selectedNoteId={store.selectedNoteId}
					onClose={() => setPaletteMode(null)}
					onOpenNote={async (id) => {
						if (store.selectedNoteId && store.selectedNoteId !== id) await store.flushDraft(store.selectedNoteId)
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
		</div>
	)
}
