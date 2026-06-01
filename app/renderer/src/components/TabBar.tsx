import { useEffect, useRef, useState } from 'react'
import type { Note } from '@shared/types'
import { deriveNoteTitle } from '@renderer/src/domain/noteUtils'
import { CloseIcon } from './icons'

interface TabBarProps {
	tabs: string[]
	activeTabId: string | null
	notes: Note[]
	drafts: Record<string, string>
	splitNoteIds: string[]
	splitLayout: 'columns' | 'grid'
	splitGridColumns: number
	onSelectTab: (id: string) => void
	onCloseTab: (id: string) => void
	onReorderTabs: (from_id: string, to_id: string) => void
	onSplitNote: (id: string) => void
	onSetSplitLayout: (layout: 'columns' | 'grid') => void
	onSetSplitGridColumns: (cols: number) => void
}

interface ContextMenuState {
	noteId: string
	x: number
	y: number
}

export function TabBar({ tabs, activeTabId, notes, drafts, splitNoteIds, splitLayout, splitGridColumns, onSelectTab, onCloseTab, onReorderTabs, onSplitNote, onSetSplitLayout, onSetSplitGridColumns }: TabBarProps) {
	const [dragging_tab_id, setDraggingTabId] = useState<string | null>(null)
	const [drop_target_tab_id, setDropTargetTabId] = useState<string | null>(null)
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
	const contextMenuRef = useRef<HTMLDivElement>(null)

	const noteById = new Map(notes.map((n) => [n.id, n]))

	// Close context menu on outside click or Escape
	useEffect(() => {
		if (!contextMenu) return
		const onPointerDown = (event: MouseEvent) => {
			if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
				setContextMenu(null)
			}
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if ('Escape' === event.key) setContextMenu(null)
		}
		window.addEventListener('mousedown', onPointerDown)
		window.addEventListener('keydown', onKeyDown)
		return () => {
			window.removeEventListener('mousedown', onPointerDown)
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [contextMenu])

	if (tabs.length === 0 && splitNoteIds.length === 0) return null

	return (
		<div className="tab-bar">
			{tabs.map((id) => {
				const note = noteById.get(id)
				const effective_content = drafts[id] ?? note?.content ?? ''
				const title = note ? deriveNoteTitle(effective_content) : 'Untitled'
				const active = id === activeTabId
				const is_pinned = splitNoteIds.includes(id)
				return (
					<div
						key={id}
						className={`tab-item ${active ? 'tab-item-active' : ''} ${dragging_tab_id === id ? 'tab-item-dragging' : ''} ${drop_target_tab_id === id ? 'tab-item-drop-target' : ''} ${is_pinned ? 'tab-item-pinned' : ''}`}
						onClick={() => onSelectTab(id)}
						onContextMenu={(event) => {
							event.preventDefault()
							setContextMenu({ noteId: id, x: event.clientX, y: event.clientY })
						}}
						draggable={true}
						onDragStart={(event) => {
							setDraggingTabId(id)
							event.dataTransfer.setData('text/plain', id)
							event.dataTransfer.effectAllowed = 'move'
						}}
						onDragOver={(event) => {
							event.preventDefault()
							if (dragging_tab_id && dragging_tab_id !== id) {
								setDropTargetTabId(id)
							}
							event.dataTransfer.dropEffect = 'move'
						}}
						onDragEnd={() => {
							setDraggingTabId(null)
							setDropTargetTabId(null)
						}}
						onDrop={(event) => {
							event.preventDefault()
							const from_id = event.dataTransfer.getData('text/plain') || dragging_tab_id
							if (from_id && from_id !== id) {
								onReorderTabs(from_id, id)
							}
							setDraggingTabId(null)
							setDropTargetTabId(null)
						}}
						title={title}
					>
						{is_pinned && (
							<svg className="tab-item-pin-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
								<path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
							</svg>
						)}
						<span className="tab-item-title">{title}</span>
						<button
							className="tab-item-close"
							draggable={false}
							onClick={(event) => {
								event.stopPropagation()
								onCloseTab(id)
							}}
							title="Close Tab"
						>
							<CloseIcon size={12} />
						</button>
					</div>
				)
			})}
			{contextMenu && (
				<div
					ref={contextMenuRef}
					className="tab-context-menu"
					style={{ left: contextMenu.x, top: contextMenu.y }}
				>
					<button
						className="tab-context-menu-item"
						onClick={() => {
							onSplitNote(contextMenu.noteId)
							setContextMenu(null)
						}}
					>
						{splitNoteIds.includes(contextMenu.noteId) ? 'Unpin Split' : 'Pin to Split View'}
					</button>
					{splitNoteIds.length >= 2 && (
						<>
							<div className="tab-context-menu-separator" />
							<button
								className="tab-context-menu-item"
								onClick={() => {
									onSetSplitLayout('columns' === splitLayout ? 'grid' : 'columns')
									setContextMenu(null)
								}}
							>
								{'columns' === splitLayout ? 'Switch to Grid Layout' : 'Switch to Column Layout'}
							</button>
							{'grid' === splitLayout && (
								<div className="tab-context-menu-sub" role="group" aria-label="Grid columns">
									{[2, 3, 4].map((cols) => (
										<button
											key={cols}
											className={`tab-context-menu-item ${cols === splitGridColumns ? 'tab-context-menu-item-checked' : ''}`}
											onClick={() => {
												onSetSplitGridColumns(cols)
												setContextMenu(null)
											}}
										>
											{cols === splitGridColumns ? '✓ ' : '   '}{cols} Columns
										</button>
									))}
								</div>
							)}
						</>
					)}
				</div>
			)}
		</div>
	)
}
