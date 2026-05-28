import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import type { Note, ThemeMode } from '@shared/types'
import type { ActiveFilter } from '@renderer/src/domain/filtering'
import { deriveNoteTitle, formatRelativeTime } from '@renderer/src/domain/noteUtils'
import { ChevronDownIcon, ChevronUpIcon, CircleChevronLeftIcon, CircleChevronRightIcon, CirclePlusIcon, MoonIcon, PinFilledIcon, SettingsIcon, StarFilledIcon, StarOutlineIcon, SunIcon, TrashIcon } from './icons'

interface SidebarProps {
	notes: Note[]
	selectedId: string | null
	activeFilter: ActiveFilter
	selectedTag: string | null
	searchQuery: string
	tags: Array<{ name: string; count: number }>
	showFiltersPanel: boolean
	sidebarCollapsed: boolean
	pinnedTags: string[]
	onSearchChange: (value: string) => void
	onSelect: (id: string) => void
	onNewNote: () => void
	onOpenSettings: () => void
	onThemeToggle: () => void
	onToggleSidebar: () => void
	onOpenTagsModal: () => void
	onFilterChange: (value: ActiveFilter) => void
	onTagFilter: (tag: string | null) => void
	onStarToggle: (id: string) => void
	onArchiveToggle: (id: string) => void
	onDelete: (id: string) => void
	onPinTag: (tag: string) => void
	onUnpinTag: (tag: string) => void
	onReorderPinned: (tags: string[]) => void
	undoDeleteTitle: string | null
	onUndoDelete: () => void
	theme: ThemeMode
}

interface MenuState {
	noteId: string
	x: number
	y: number
}

export function Sidebar(props: SidebarProps) {
	const { pinnedTags, onUnpinTag, onReorderPinned } = props
	const [menu, setMenu] = useState<MenuState | null>(null)
	const [tagsCollapsed, setTagsCollapsed] = useState(false)
	const [dragIndex, setDragIndex] = useState<number | null>(null)
	const [visibleCountsByKey, setVisibleCountsByKey] = useState<Record<string, number>>({})
	const menuRef = useRef<HTMLDivElement>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	const selectedIndex = useMemo(() => props.notes.findIndex((note) => note.id === props.selectedId), [props.notes, props.selectedId])
	const active_list_key = useMemo(
		() => `${props.activeFilter}|${props.searchQuery}|${props.selectedTag ?? ''}|${props.notes.length}`,
		[props.activeFilter, props.searchQuery, props.selectedTag, props.notes.length],
	)
	const visibleCount = visibleCountsByKey[active_list_key] ?? 50

	// Auto-load more notes on scroll
	const onScrollNearBottom = useCallback(() => {
		const el = scrollRef.current
		if (!el) return
		const threshold = 80 // px from bottom to trigger load
		if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
			setVisibleCountsByKey((prev) => {
				const current_count = prev[active_list_key] ?? 50
				const next_count = Math.min(current_count + 50, props.notes.length)
				if (next_count === current_count) return prev
				return {
					...prev,
					[active_list_key]: next_count,
				}
			})
		}
	}, [active_list_key, props.notes.length])

	const visibleNotes = props.notes.slice(0, visibleCount)
	const hasMore = visibleCount < props.notes.length

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
						<p className="app-title">STRATA</p>
					</div>}
					<div className="app-title-actions">
						<button className="icon-button sidebar-collapse-button sidebar-new-note-btn" onClick={props.onNewNote} title="New Note"><CirclePlusIcon size={18} /></button>
						<button className="icon-button sidebar-collapse-button sidebar-toggle-btn" onClick={props.onToggleSidebar} title={props.sidebarCollapsed ? 'Open Sidebar' : 'Close Sidebar'}>
							{props.sidebarCollapsed ? <CircleChevronRightIcon /> : <CircleChevronLeftIcon />}
						</button>
					</div>
				</div>
			</div>
			{!props.sidebarCollapsed && (
				<div className="sidebar-scroll" ref={scrollRef} onScroll={onScrollNearBottom}>
					{/* Tags — collapsible, pinned-only shortlist */}
					<div className="tags-section">
						<div className="tags-header-row">
							<button className="tags-header-toggle" onClick={() => setTagsCollapsed((v) => !v)} title={tagsCollapsed ? 'Show tags' : 'Hide tags'} aria-expanded={!tagsCollapsed}>
								<span className="tags-label">Tags</span>
								<span className="tags-collapse-btn" aria-hidden="true">
									{tagsCollapsed ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
								</span>
							</button>
						</div>
						{!tagsCollapsed && pinnedTags.length > 0 && (
							<div className="pinned-tags">
								{pinnedTags.map((tag, idx) => (
									<button
										key={tag}
										draggable
										className={`tag-filter tag-pinned ${props.selectedTag === tag ? 'tag-filter-active' : ''}`}
										onClick={() => props.onTagFilter(tag)}
										onDragStart={() => setDragIndex(idx)}
										onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
										onDrop={() => {
											if (null !== dragIndex && dragIndex !== idx) {
												const reordered = [...pinnedTags]
												const [moved] = reordered.splice(dragIndex, 1)
												reordered.splice(idx, 0, moved)
												onReorderPinned(reordered)
											}
											setDragIndex(null)
										}}
										onDragEnd={() => setDragIndex(null)}
									>
										<span className="tag-filter-label">{tag}</span>
										<span className="tag-count-row">
											<span className="tag-hotkey">⌘{idx + 1}</span>
											<button className="tag-pin-btn pin-active" onClick={(e) => { e.stopPropagation(); onUnpinTag(tag) }} title="Unpin tag"><PinFilledIcon size={13} /></button>
										</span>
									</button>
								))}
							</div>
						)}
						{!tagsCollapsed && 0 === pinnedTags.length && (
							<button className="pinned-tags-empty-link" type="button" onClick={props.onOpenTagsModal}>
								View tags
							</button>
						)}
					</div>
					<p className="tags-label sidebar-notes-heading">Notes</p>
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
					<button className="icon-button" onClick={props.onOpenSettings} title="Settings"><SettingsIcon /></button>
					<button className="icon-button sidebar-theme-toggle" onClick={props.onThemeToggle} title="Toggle Theme">{'dark' === props.theme ? <MoonIcon /> : <SunIcon />}</button>
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
