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
	if (!open) return null

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-card" onClick={(event) => event.stopPropagation()}>
				<button className="icon-button modal-close-button" onClick={onClose} aria-label="Close"><CloseIcon /></button>
				<h3>All Tags</h3>
				<div className="tags-modal-list">
					<button className={`tag-filter tag-modal-item ${null === selectedTag ? 'tag-filter-active' : ''}`} onClick={() => { onSelectTag(null); onClose() }}>
						<span>All tags</span>
					</button>
					{tags.map((tag) => {
						const is_pinned = pinnedTags.includes(tag.name)
						return (
							<button key={tag.name} className={`tag-filter tag-modal-item ${is_pinned ? 'tag-pinned' : ''} ${selectedTag === tag.name ? 'tag-filter-active' : ''}`} onClick={() => { onSelectTag(tag.name); onClose() }}>
								<span>#{tag.name}</span>
								<span className="tag-count-row">
									<span>{tag.count}</span>
									<button className="tag-pin-btn" onClick={(e) => { e.stopPropagation(); is_pinned ? onUnpinTag(tag.name) : onPinTag(tag.name) }} title={is_pinned ? 'Unpin tag' : 'Pin tag'}>
										📌
									</button>
								</span>
							</button>
						)
					})}
				</div>
			</div>
		</div>
	)
}
