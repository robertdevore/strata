interface CheatSheetModalProps {
	open: boolean
	onClose: () => void
}

export function CheatSheetModal({ open, onClose }: CheatSheetModalProps) {
	if (!open) return null
	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-card" onClick={(event) => event.stopPropagation()}>
				<h3>Markdown cheat sheet</h3>
				<ul className="cheat-list">
					<li># Heading</li>
					<li>**bold**</li>
					<li>*italic*</li>
					<li>- list item</li>
					<li>[link](https://example.com)</li>
				</ul>
				<div className="modal-actions">
					<button className="primary-button" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	)
}
