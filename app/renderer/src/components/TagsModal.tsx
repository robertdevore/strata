import { useEffect, useRef, useState } from 'react'
import { CloseIcon, PinFilledIcon, PinIcon } from './icons'

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
	const [sort_by, set_sort_by] = useState<'alphabet' | 'count'>('alphabet')
	const [sort_order, set_sort_order] = useState<'asc' | 'desc'>('asc')
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
		if (!open) {
			setQuery('')
			set_sort_by('alphabet')
			set_sort_order('asc')
		}
	}, [open])

	if (!open) return null

	const filtered = query.trim()
		? tags.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
		: tags

	const pinned_filtered = query.trim()
		? pinnedTags.filter((t) => t.toLowerCase().includes(query.toLowerCase()))
		: pinnedTags

	const sorted_tags = filtered
		.filter((t) => !pinnedTags.includes(t.name))
		.slice()
		.sort((a, b) => {
			const direction = 'asc' === sort_order ? 1 : -1
			if ('count' === sort_by) {
				if (a.count === b.count) {
					return direction * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
				}
				return direction * (a.count - b.count)
			}
			return direction * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		})

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
					<button className="icon-button palette-search-close-btn" onClick={onClose} aria-label="Close"><CloseIcon size={16} /></button>
				</div>
				<div className="palette-results">
					{pinned_filtered.length > 0 && (
						<>
							<div className="palette-section-header">Pinned</div>
							{pinned_filtered.map((tag) => {
								const pinned_index = pinnedTags.indexOf(tag)
								return (
								<button key={tag} className={`palette-item ${selectedTag === tag ? 'palette-item-active' : ''}`} onClick={() => { onSelectTag(tag); onClose() }}>
									<span className="palette-item-label">{tag}</span>
									<span className="palette-item-hint">
										{pinned_index >= 0 && <span className="tag-hotkey">⌘{pinned_index + 1}</span>}
										<button className="tag-pin-btn pin-active" onClick={(e) => { e.stopPropagation(); onUnpinTag(tag) }} title="Unpin"><PinFilledIcon size={13} /></button>
									</span>
								</button>
								)
							})}
						</>
					)}
					<div className={`palette-all-tags-controls ${pinned_filtered.length > 0 ? 'palette-all-tags-controls-separated' : ''}`}>
						<div className="palette-controls-label">Filters for all tags</div>
						<div className="palette-sort-row" role="group" aria-label="Tag sorting options">
							<label className="palette-sort-field">
								<span>Sort by</span>
								<select value={sort_by} onChange={(event) => set_sort_by(event.target.value as 'alphabet' | 'count')}>
									<option value="alphabet">Alphabet</option>
									<option value="count">Count</option>
								</select>
							</label>
							<label className="palette-sort-field">
								<span>Order</span>
								<select value={sort_order} onChange={(event) => set_sort_order(event.target.value as 'asc' | 'desc')}>
									<option value="asc">Ascending</option>
									<option value="desc">Descending</option>
								</select>
							</label>
						</div>
					</div>
					<div className="palette-section-header">All tags</div>
					{sorted_tags.map((tag) => (
						<button key={tag.name} className={`palette-item ${selectedTag === tag.name ? 'palette-item-active' : ''}`} onClick={() => { onSelectTag(tag.name); onClose() }}>
							<span className="palette-item-label">{tag.name}</span>
							<span className="palette-item-hint">
								<span>{tag.count}</span>
								<button className="tag-pin-btn" onClick={(e) => { e.stopPropagation(); onPinTag(tag.name) }} title="Pin"><PinIcon size={13} /></button>
							</span>
						</button>
					))}
				</div>
			</div>
		</div>
	)
}
