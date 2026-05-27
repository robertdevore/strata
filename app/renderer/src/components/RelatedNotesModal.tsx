import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Note } from '@shared/types'
import { deriveNoteTitle } from '@renderer/src/domain/noteUtils'
import { CloseIcon } from './icons'

interface RelatedNotesModalProps {
	open: boolean
	relatedNotes: Array<{ note: Note; reason: string; score: number }>
	onClose: () => void
	onOpenNote: (note_id: string, new_tab: boolean) => void
}

export function RelatedNotesModal({ open, relatedNotes, onClose, onOpenNote }: RelatedNotesModalProps) {
	const overlayRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		const onKeyDown = (event: KeyboardEvent) => {
			if ('Escape' === event.key) {
				event.preventDefault()
				onClose()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [open, onClose])

	if (!open) return null

	return createPortal(
		<div
			className="modal-overlay"
			ref={overlayRef}
			onMouseDown={(event) => {
				if (event.target === overlayRef.current) onClose()
			}}
		>
			<div className="modal-card related-notes-modal">
				<h3 className="related-notes-heading">Related Notes</h3>
				<button className="icon-button modal-close-button" onClick={onClose} aria-label="Close related notes" title="Close"><CloseIcon /></button>
				<div className="related-notes-body">
					{relatedNotes.length === 0 && (
						<p className="related-notes-empty">No related notes found. Try adding wiki links, tags, or similar text to connect notes.</p>
					)}
					{relatedNotes.map((entry) => (
						<div
							key={entry.note.id}
							className="related-note-row"
							role="button"
							tabIndex={0}
							onClick={(event) => onOpenNote(entry.note.id, event.metaKey || event.ctrlKey)}
							onKeyDown={(event) => {
								if ('Enter' === event.key) onOpenNote(entry.note.id, event.metaKey || event.ctrlKey)
							}}
						>
							<span className="related-note-title">{deriveNoteTitle(entry.note.content)}</span>
							<span className="related-note-reason">{entry.reason}</span>
						</div>
					))}
				</div>
			</div>
		</div>,
		document.body,
	)
}
