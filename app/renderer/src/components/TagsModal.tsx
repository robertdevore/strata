import { useEffect, useRef, useState } from 'react'
import { CloseIcon } from './icons'

interface TagsModalProps {
	open: boolean
	tags: Array<{ name: string; count: number }>
	pinnedTags: string[]
	selectedTag: string | null
	onClose: () => void
	onSelectTag: (tag: string | null) => void
	onPinTag: (tag: string) => void
	onUnpinTag: (tag: string) => void
}

export function TagsModal({ open, tags, pinnedTags, selectedTag, onClose, onSelectTag, onPinTag, onUnpinTag }: TagsModalProps) {
	const [query, setQuery] = useState('')
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (!open) return
		setQuery('')
		const onKeyDown = (event: KeyboardEvent) => {
			if ('Escape' === event.key) { event.preventDefault(); onClose() }
		}
		window.addEventListener('keydown', onKeyDown)
		window.setTimeout(() => inputRef.current?.focus(), 10)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [open, onClose])

	useEffect(() => {
		if (!open) setQuery('')
	}, [open])

	if (!open) return null

	const filtered = query.trim()
		? tags.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
		: tags

	const pinned_filtered = query.trim()
		? pinnedTags.filter((t) => t.toLowerCase().includes(query.toLowerCase()))
		: pinnedTags

	return (
		<div className="modal-overlay palette-overlay" onClick={onClose}>
			<div className="modal-card palette-card" onClick={(event) => event.stopPropagation()}>
				<div className="palette-search-row">
					<span className="palette-mode-badge">Tags</span>
					<input
						ref={inputRef}
						className="palette-search-input"
						type="text"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search tags..."
						autoFocus
					/>
					<button className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon size={16} /></button>
				</div>
				<div className="palette-results">
					<button className={`palette-item ${null === selectedTag ? 'palette-item-active' : ''}`} onClick={() => { onSelectTag(null); onClose() }}>
						<span>All tags</span>
					</button>
					{pinned_filtered.length > 0 && (
						<>
							<div className="palette-section-header">Pinned</div>
							{pinned_filtered.map((tag) => (
								<button key={tag} className={`palette-item ${selectedTag === tag ? 'palette-item-active' : ''}`} onClick={() => { onSelectTag(tag); onClose() }}>
									<span className="palette-item-label">#{tag}</span>
									<span className="palette-item-hint">
										<button className="tag-pin-btn pin-active" onClick={(e) => { e.stopPropagation(); onUnpinTag(tag) }} title="Unpin">📌</button>
									</span>
								</button>
							))}
						</>
					)}
					<div className="palette-section-header">All tags</div>
					{filtered.filter((t) => !pinnedTags.includes(t.name)).map((tag) => (
						<button key={tag.name} className={`palette-item ${selectedTag === tag.name ? 'palette-item-active' : ''}`} onClick={() => { onSelectTag(tag.name); onClose() }}>
							<span className="palette-item-label">#{tag.name}</span>
							<span className="palette-item-hint">
								<span>{tag.count}</span>
								<button className="tag-pin-btn" onClick={(e) => { e.stopPropagation(); onPinTag(tag.name) }} title="Pin">📌</button>
							</span>
						</button>
					))}
				</div>
			</div>
		</div>
	)
}
