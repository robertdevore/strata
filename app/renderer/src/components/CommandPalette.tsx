import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '@shared/types'
import { deriveNoteTitle, formatRelativeTime } from '@renderer/src/domain/noteUtils'
import type { UiCommand } from '@renderer/src/utils/commands'

export type PaletteMode = 'quick-open' | 'commands'

interface PaletteCommand {
	id: UiCommand | 'toggle-preview' | 'toggle-chat-panel' | 'open-settings' | 'export-markdown'
	label: string
	shortcut?: string
	requiresNote?: boolean
}

const COMMANDS: PaletteCommand[] = [
	{ id: 'new-note', label: 'New Note', shortcut: '⌘N' },
	{ id: 'save-note', label: 'Save Note', shortcut: '⌘S' },
	{ id: 'toggle-star', label: 'Toggle Star', shortcut: '⌘⇧S', requiresNote: true },
	{ id: 'toggle-archive', label: 'Toggle Archive', shortcut: '⌘⇧A', requiresNote: true },
	{ id: 'open-tags-editor', label: 'Edit Tags', shortcut: '⌘T', requiresNote: true },
	{ id: 'delete-note', label: 'Delete Note', shortcut: '⌘⌫', requiresNote: true },
	{ id: 'toggle-filters', label: 'Toggle Filters Panel', shortcut: '⌘⇧F' },
	{ id: 'toggle-preview', label: 'Toggle Preview', requiresNote: true },
	{ id: 'toggle-chat-panel', label: 'Toggle AI Chat Panel' },
	{ id: 'copy-rich-text', label: 'Copy Rich Text', requiresNote: true },
	{ id: 'open-settings', label: 'Open Settings' },
]

interface CommandPaletteProps {
	mode: PaletteMode
	notes: Note[]
	selectedNoteId: string | null
	onClose: () => void
	onOpenNote: (id: string) => void
	onRunCommand: (command: UiCommand) => void
	onTogglePreview: () => void
	onToggleChatPanel: () => void
	onOpenSettings: () => void
}

export function CommandPalette({
	mode,
	notes,
	selectedNoteId,
	onClose,
	onOpenNote,
	onRunCommand,
	onTogglePreview,
	onToggleChatPanel,
	onOpenSettings,
}: CommandPaletteProps) {
	const [query, setQuery] = useState('')
	const [selectedIndex, setSelectedIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)

	// Focus input on mount
	useEffect(() => {
		const timer = window.setTimeout(() => inputRef.current?.focus(), 10)
		return () => window.clearTimeout(timer)
	}, [])

	// Reset selection when query changes
	useEffect(() => {
		setSelectedIndex(0)
	}, [query])

	// Filtered note results (quick-open mode)
	const noteResults = useMemo(() => {
		if ('quick-open' !== mode) return []
		if (!query.trim()) return notes.slice(0, 30)
		const q = query.toLowerCase()
		return notes
			.filter((n) => {
				const title = deriveNoteTitle(n.content).toLowerCase()
				const body = n.content.toLowerCase()
				const tags = n.tags.join(' ').toLowerCase()
				return title.includes(q) || body.includes(q) || tags.includes(q)
			})
			.slice(0, 30)
	}, [mode, notes, query])

	// Filtered command results (commands mode)
	const commandResults = useMemo(() => {
		if ('commands' !== mode) return []
		const q = query.toLowerCase().trim()
		let filtered = COMMANDS
		if (q) {
			filtered = COMMANDS.filter((c) => c.label.toLowerCase().includes(q))
		}
		// Filter out commands that require a note when none is selected
		return filtered.filter((c) => !c.requiresNote || selectedNoteId)
	}, [mode, query, selectedNoteId])

	const totalItems = 'quick-open' === mode ? noteResults.length : commandResults.length

	// Arrow key + Enter navigation
	const onKeyDown = (event: React.KeyboardEvent) => {
		if ('ArrowDown' === event.key) {
			event.preventDefault()
			setSelectedIndex((prev) => (prev + 1) % Math.max(1, totalItems))
		} else if ('ArrowUp' === event.key) {
			event.preventDefault()
			setSelectedIndex((prev) => (prev - 1 + totalItems) % Math.max(1, totalItems))
		} else if ('Enter' === event.key) {
			event.preventDefault()
			activateSelected()
		} else if ('Escape' === event.key) {
			event.preventDefault()
			onClose()
		}
	}

	const activateSelected = () => {
		if ('quick-open' === mode) {
			const note = noteResults[selectedIndex]
			if (note) {
				onOpenNote(note.id)
				onClose()
			}
		} else {
			const cmd = commandResults[selectedIndex]
			if (cmd) {
				executeCommand(cmd)
				onClose()
			}
		}
	}

	const executeCommand = (cmd: PaletteCommand) => {
		switch (cmd.id) {
			case 'toggle-preview':
				onTogglePreview()
				break
			case 'toggle-chat-panel':
				onToggleChatPanel()
				break
			case 'open-settings':
				onOpenSettings()
				break
			default:
				onRunCommand(cmd.id as UiCommand)
		}
	}

	// Scroll selected item into view
	useEffect(() => {
		if (!listRef.current) return
		const items = listRef.current.children
		if (items[selectedIndex]) {
			items[selectedIndex].scrollIntoView({ block: 'nearest' })
		}
	}, [selectedIndex])

	return (
		<div className="modal-overlay palette-overlay" onClick={onClose}>
			<div className="palette-container" onClick={(event) => event.stopPropagation()}>
				<input
					ref={inputRef}
					className="palette-input"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={onKeyDown}
					placeholder={'quick-open' === mode ? 'Search notes...' : 'Run a command...'}
					aria-label={'quick-open' === mode ? 'Quick open notes' : 'Command palette'}
				/>
				{totalItems > 0 && (
					<div className="palette-results" ref={listRef}>
						{'quick-open' === mode
							? noteResults.map((note, index) => (
									<div
										key={note.id}
										className={`palette-item ${index === selectedIndex ? 'palette-item-selected' : ''}`}
										onMouseEnter={() => setSelectedIndex(index)}
										onClick={() => {
											onOpenNote(note.id)
											onClose()
										}}
									>
										<div className="palette-item-title">{deriveNoteTitle(note.content)}</div>
										<div className="palette-item-meta">
											{note.tags.length > 0 && (
												<span className="palette-item-tags">
													{note.tags.slice(0, 3).join(' ')}
												</span>
											)}
											<span className="palette-item-time">{formatRelativeTime(note.updatedAt)}</span>
										</div>
									</div>
								))
							: commandResults.map((cmd, index) => (
									<div
										key={cmd.id}
										className={`palette-item ${index === selectedIndex ? 'palette-item-selected' : ''}`}
										onMouseEnter={() => setSelectedIndex(index)}
										onClick={() => {
											executeCommand(cmd)
											onClose()
										}}
									>
										<span className="palette-item-title">{cmd.label}</span>
										{cmd.shortcut && <span className="palette-item-shortcut">{cmd.shortcut}</span>}
									</div>
								))}
					</div>
				)}
				{0 === totalItems && query.trim() && (
					<div className="palette-empty">No results</div>
				)}
			</div>
		</div>
	)
}
