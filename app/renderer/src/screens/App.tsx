import { useCallback, useEffect, useState } from 'react'
import { EditorPane } from '@renderer/src/components/EditorPane'
import { Sidebar } from '@renderer/src/components/Sidebar'
import { ConfirmModal } from '@renderer/src/components/ConfirmModal'
import { SettingsModal } from '@renderer/src/components/SettingsModal'
import { useAppStore } from '@renderer/src/state/useAppStore'
import type { UiCommand } from '@renderer/src/utils/commands'

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
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
	const [sidebarWidth, setSidebarWidth] = useState(320)

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

	const onDelete = useCallback(async (id: string) => {
		if (store.settings.confirmDelete) {
			setPendingDeleteId(id)
			return
		}
		if (store.selectedNoteId !== id) store.selectNote(id)
		await store.deleteSelected()
	}, [store])

	const runCommand = useCallback(async (command: UiCommand) => {
		if ('new-note' === command) return store.createNote()
		if ('focus-search' === command) return window.dispatchEvent(new CustomEvent('strata:focus-search'))
		if ('save-note' === command && store.selectedNoteId) return store.flushDraft(store.selectedNoteId)
		if ('toggle-star' === command && store.selectedNoteId) return store.toggleStar(store.selectedNoteId)
		if ('toggle-archive' === command && store.selectedNoteId) return store.toggleArchive(store.selectedNoteId)
		if ('toggle-filters' === command) return store.setShowFiltersPanel(!store.showFiltersPanel)
		if ('delete-note' === command && store.selectedNoteId) return onDelete(store.selectedNoteId)
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
		const onKeyDown = (event: KeyboardEvent) => {
			const meta = isMac ? event.metaKey : event.ctrlKey
			if (!meta) {
				if ('Escape' === event.key) {
					setPendingDeleteId(null)
					store.setShowSettings(false)
				}
				return
			}
			const key = event.key.toLowerCase()
			if ('n' === key) {
				event.preventDefault()
				void runCommand('new-note')
			}
			if ('f' === key && !event.shiftKey) {
				event.preventDefault()
				void runCommand('focus-search')
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
			if ('Backspace' === event.key) {
				event.preventDefault()
				void runCommand('delete-note')
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [runCommand, store])

	return (
		<div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
			<div className="workspace-layout" style={{ gridTemplateColumns: sidebarCollapsed ? '116px minmax(0, 1fr)' : `${sidebarWidth}px 6px minmax(0, 1fr)` }}>
				<Sidebar
					notes={notes}
					selectedId={store.selectedNoteId}
					activeFilter={store.activeFilter}
					selectedTag={store.selectedTag}
					searchQuery={store.searchQuery}
					tags={store.tags}
					showFiltersPanel={store.showFiltersPanel}
					sidebarCollapsed={sidebarCollapsed}
					onSearchChange={store.setSearchQuery}
					onSelect={async (id) => {
						if (store.selectedNoteId && store.selectedNoteId !== id) await store.flushDraft(store.selectedNoteId)
						store.selectNote(id)
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
					theme={store.settings.theme}
				/>
				{!sidebarCollapsed && <div className="panel-resizer panel-resizer-sidebar" onMouseDown={startSidebarResize} role="separator" aria-orientation="vertical" aria-label="Resize sidebar" />}
				<EditorPane
					note={store.selectedNote()}
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
				/>
			</div>
			<SettingsModal open={store.showSettings} settings={store.settings} onClose={() => store.setShowSettings(false)} onUpdate={(patch) => void store.updateSettings(patch)} />
			<ConfirmModal
				open={Boolean(pendingDeleteId)}
				title="Delete note"
				message="This note will be removed permanently."
				onCancel={() => setPendingDeleteId(null)}
				onConfirm={async () => {
					if (pendingDeleteId && store.selectedNoteId !== pendingDeleteId) store.selectNote(pendingDeleteId)
					await store.deleteSelected()
					setPendingDeleteId(null)
				}}
			/>
		</div>
	)
}
