import { useState } from 'react'
import type { Note } from '@shared/types'
import { deriveNoteTitle } from '@renderer/src/domain/noteUtils'
import { CloseIcon } from './icons'

interface TabBarProps {
	tabs: string[]
	activeTabId: string | null
	notes: Note[]
	drafts: Record<string, string>
	onSelectTab: (id: string) => void
	onCloseTab: (id: string) => void
	onReorderTabs: (from_id: string, to_id: string) => void
}

export function TabBar({ tabs, activeTabId, notes, drafts, onSelectTab, onCloseTab, onReorderTabs }: TabBarProps) {
	const [dragging_tab_id, setDraggingTabId] = useState<string | null>(null)
	const [drop_target_tab_id, setDropTargetTabId] = useState<string | null>(null)

	const noteById = new Map(notes.map((n) => [n.id, n]))

	if (tabs.length <= 1) return null

	return (
		<div className="tab-bar">
			{tabs.map((id) => {
				const note = noteById.get(id)
				const effective_content = drafts[id] ?? note?.content ?? ''
				const title = note ? deriveNoteTitle(effective_content) : 'Untitled'
				const active = id === activeTabId
				return (
					<div
						key={id}
						className={`tab-item ${active ? 'tab-item-active' : ''} ${dragging_tab_id === id ? 'tab-item-dragging' : ''} ${drop_target_tab_id === id ? 'tab-item-drop-target' : ''}`}
						onClick={() => onSelectTab(id)}
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
		</div>
	)
}
