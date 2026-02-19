import { CloseIcon, TrashIcon } from './icons'

interface ConfirmModalProps {
	open: boolean
	title: string
	message: string
	onCancel: () => void
	onConfirm: () => void
}

export function ConfirmModal({ open, title, message, onCancel, onConfirm }: ConfirmModalProps) {
	if (!open) return null
	return (
		<div className="modal-overlay" role="dialog" aria-modal="true">
			<div className="modal-card">
				<h3>{title}</h3>
				<p>{message}</p>
				<div className="modal-actions">
					<button className="icon-button" onClick={onCancel} aria-label="Close" title="Close">
						<CloseIcon />
					</button>
					<button className="icon-button" onClick={onConfirm} aria-label="Delete" title="Delete">
						<TrashIcon />
					</button>
				</div>
			</div>
		</div>
	)
}
