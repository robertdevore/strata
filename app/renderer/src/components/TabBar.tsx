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
}

export function TabBar({ tabs, activeTabId, notes, drafts, onSelectTab, onCloseTab }: TabBarProps) {
	if (tabs.length <= 1) return null

	const noteById = new Map(notes.map((n) => [n.id, n]))

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
						className={`tab-item ${active ? 'tab-item-active' : ''}`}
						onClick={() => onSelectTab(id)}
						title={title}
					>
						<span className="tab-item-title">{title}</span>
						<button
							className="tab-item-close"
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
