import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import type { Note, ThemeMode } from '@shared/types'
import type { ActiveFilter } from '@renderer/src/domain/filtering'
import { deriveNoteTitle, formatRelativeTime } from '@renderer/src/domain/noteUtils'
import { CircleChevronLeftIcon, CircleChevronRightIcon, MenuIcon, MoonIcon, SettingsIcon, StarFilledIcon, StarOutlineIcon, SunIcon, TrashIcon } from './icons'

interface SidebarProps {
	notes: Note[]
	selectedId: string | null
	activeFilter: ActiveFilter
	selectedTag: string | null
	searchQuery: string
	tags: Array<{ name: string; count: number }>
	showFiltersPanel: boolean
	sidebarCollapsed: boolean
	onSearchChange: (value: string) => void
	onSelect: (id: string) => void
	onNewNote: () => void
	onOpenSettings: () => void
	onThemeToggle: () => void
	onToggleSidebar: () => void
	onToggleFiltersPanel: () => void
	onFilterChange: (value: ActiveFilter) => void
	onTagFilter: (tag: string | null) => void
	onStarToggle: (id: string) => void
	onArchiveToggle: (id: string) => void
	onDelete: (id: string) => void
	undoDeleteTitle: string | null
	onUndoDelete: () => void
	theme: ThemeMode
}

interface MenuState {
	noteId: string
	x: number
	y: number
}

const filters: ActiveFilter[] = ['all', 'starred', 'archived', 'untagged']

export function Sidebar(props: SidebarProps) {
	const [menu, setMenu] = useState<MenuState | null>(null)
	const [visibleCount, setVisibleCount] = useState(50)
	const searchRef = useRef<HTMLInputElement>(null)
	const menuRef = useRef<HTMLDivElement>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	const selectedIndex = useMemo(() => props.notes.findIndex((note) => note.id === props.selectedId), [props.notes, props.selectedId])

	// Reset visible count when the note list changes (filter, search, tag, sort)
	useEffect(() => {
		setVisibleCount(50)
	}, [props.notes])

	// Auto-load more notes on scroll
	const onScrollNearBottom = useCallback(() => {
		const el = scrollRef.current
		if (!el) return
		const threshold = 80 // px from bottom to trigger load
		if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
			setVisibleCount((prev) => Math.min(prev + 50, props.notes.length))
		}
	}, [props.notes.length])

	const visibleNotes = props.notes.slice(0, visibleCount)
	const hasMore = visibleCount < props.notes.length

	useEffect(() => {
		const focus = () => searchRef.current?.focus()
		window.addEventListener('strata:focus-search', focus)
		return () => window.removeEventListener('strata:focus-search', focus)
	}, [])

	useEffect(() => {
		if (!menu) return
		const onPointerDown = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setMenu(null)
			}
		}
		window.addEventListener('mousedown', onPointerDown)
		return () => window.removeEventListener('mousedown', onPointerDown)
	}, [menu])

	const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (0 === props.notes.length) return
		if ('ArrowDown' === event.key) {
			event.preventDefault()
			const next = selectedIndex < props.notes.length - 1 ? selectedIndex + 1 : 0
			props.onSelect(props.notes[next].id)
		}
		if ('ArrowUp' === event.key) {
			event.preventDefault()
			const next = selectedIndex > 0 ? selectedIndex - 1 : props.notes.length - 1
			props.onSelect(props.notes[next].id)
		}
		if ('Enter' === event.key && props.selectedId) {
			props.onSelect(props.selectedId)
		}
	}

	return (
		<aside className="sidebar">
			<div className="sidebar-top">
				<div className="app-title-row">
					{!props.sidebarCollapsed && <div className="app-title-left">
						<div className="app-title-group">
							<p className="app-title">STRATA</p>
								<p className="app-version">v0.4.0</p>
						</div>
					</div>}
					<button className="icon-button sidebar-collapse-button" onClick={props.onToggleSidebar} title={props.sidebarCollapsed ? 'Open Sidebar' : 'Close Sidebar'}>
						{props.sidebarCollapsed ? <CircleChevronRightIcon /> : <CircleChevronLeftIcon />}
					</button>
				</div>
				{!props.sidebarCollapsed && (
				<input ref={searchRef} className="search-input" placeholder={`Search ${props.notes.length} notes`} value={props.searchQuery} onChange={(event) => props.onSearchChange(event.target.value)} />
				)}
			{!props.sidebarCollapsed && props.showFiltersPanel && (
					<>
						<div className="chip-row">
							{filters.map((chip) => (
								<button key={chip} className={`chip ${props.activeFilter === chip ? 'chip-active' : ''}`} onClick={() => props.onFilterChange(chip)}>
									{chip[0].toUpperCase() + chip.slice(1)}
								</button>
							))}
						</div>
					</>
				)}
			</div>
			{!props.sidebarCollapsed && (
				<div className="sidebar-scroll" ref={scrollRef} onScroll={onScrollNearBottom}>
					{props.showFiltersPanel && (
						<div className="tags-section">
							<p className="tags-label">Tags</p>
							<button className={`tag-filter ${null === props.selectedTag ? 'tag-filter-active' : ''}`} onClick={() => props.onTagFilter(null)}>
								<span>All tags</span>
							</button>
							{props.tags.map((tag) => (
								<button key={tag.name} className={`tag-filter ${props.selectedTag === tag.name ? 'tag-filter-active' : ''}`} onClick={() => props.onTagFilter(tag.name)}>
									<span>#{tag.name}</span>
									<span>{tag.count}</span>
								</button>
							))}
						</div>
					)}
					<div className="notes-list" tabIndex={0} onKeyDown={onListKeyDown}>
				{visibleNotes.map((note) => (
					<div
						key={note.id}
						className={`note-row ${props.selectedId === note.id ? 'note-row-active' : ''}`}
						role="button"
						tabIndex={-1}
						onClick={() => props.onSelect(note.id)}
						onContextMenu={(event) => {
							event.preventDefault()
							setMenu({ noteId: note.id, x: event.clientX, y: event.clientY })
						}}
					>
						<div className="note-row-title-wrap">
							<span className="note-row-title">{deriveNoteTitle(note.content)}</span>
							<span className="note-row-time">{formatRelativeTime(note.updatedAt)}</span>
							<div className="note-row-icons">
								<button
									type="button"
									className={`note-row-star ${note.starred ? 'starred' : ''}`}
									onClick={(event) => {
										event.stopPropagation()
										props.onStarToggle(note.id)
									}}
									title={note.starred ? 'Unstar Note' : 'Star Note'}
								>
									{note.starred ? <StarFilledIcon size={14} /> : <StarOutlineIcon size={14} />}
								</button>
								<button
									type="button"
									className="note-row-delete"
									onClick={(event) => {
										event.stopPropagation()
										props.onDelete(note.id)
									}}
									title="Delete Note"
								>
									<TrashIcon size={14} />
								</button>
							</div>
						</div>
					</div>
				))}
				{hasMore && (
					<div className="sidebar-load-more">
						{visibleCount} of {props.notes.length} notes · scroll for more
					</div>
				)}
				</div>
			</div>
			)}
			{!props.sidebarCollapsed && props.undoDeleteTitle && (
				<div className="sidebar-undo-toast" role="status" aria-live="polite">
					<span className="sidebar-undo-text">Deleted “{props.undoDeleteTitle}”</span>
					<button className="ghost-button sidebar-undo-button" onClick={props.onUndoDelete}>Undo</button>
				</div>
			)}
			{!props.sidebarCollapsed && <div className="sidebar-bottom">
				<div className="bottom-actions">
					<button className="primary-button new-note-button" onClick={props.onNewNote}>New Note</button>
					<button className="icon-button" onClick={props.onToggleFiltersPanel} title="Toggle Filters"><MenuIcon /></button>
					<button className="icon-button" onClick={props.onThemeToggle} title="Toggle Theme">{'dark' === props.theme ? <MoonIcon /> : <SunIcon />}</button>
					<button className="icon-button" onClick={props.onOpenSettings} title="Settings"><SettingsIcon /></button>
				</div>
			</div>}
			{menu && (
				<div className="context-menu" ref={menuRef} style={{ left: menu.x, top: menu.y }}>
					<button onClick={() => { props.onStarToggle(menu.noteId); setMenu(null) }}>Star / Unstar</button>
					<button onClick={() => { props.onArchiveToggle(menu.noteId); setMenu(null) }}>Archive / Unarchive</button>
					<button className="danger" onClick={() => { props.onDelete(menu.noteId); setMenu(null) }}>Delete</button>
				</div>
			)}
		</aside>
	)
}
