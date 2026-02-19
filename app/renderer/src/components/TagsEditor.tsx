import { useEffect, useMemo, useState } from 'react'
import { CheckIcon, CloseIcon } from './icons'

interface TagsEditorProps {
	open: boolean
	currentTags: string[]
	existingTags: string[]
	onClose: () => void
	onApply: (tags: string[]) => void
}

export function TagsEditor({ open, currentTags, existingTags, onClose, onApply }: TagsEditorProps) {
	const [value, setValue] = useState('')

	useEffect(() => {
		if (open) setValue(currentTags.join(', '))
	}, [open, currentTags])

	const suggestions = useMemo(() => {
		const input = value.split(',').pop()?.trim().toLowerCase() ?? ''
		if (!input) return existingTags.slice(0, 6)
		return existingTags.filter((tag) => tag.includes(input)).slice(0, 6)
	}, [existingTags, value])

	if (!open) return null

	return (
		<div className="popover-overlay" onClick={onClose}>
			<div className="popover" onClick={(event) => event.stopPropagation()}>
				<button className="icon-button modal-close-button" onClick={onClose} aria-label="Close tags editor" title="Close tags editor">
					<CloseIcon />
				</button>
				<p>Edit tags</p>
				<input value={value} onChange={(event) => setValue(event.target.value)} placeholder="comma,separated,tags" />
				<div className="suggestions">
					{suggestions.map((tag) => (
						<button key={tag} onClick={() => setValue(value ? `${value}, ${tag}` : tag)}>
							#{tag}
						</button>
					))}
				</div>
				<div className="modal-actions">
					<button
						className="icon-button"
						aria-label="Apply tags"
						title="Apply tags"
						onClick={() => {
							onApply(value.split(',').map((item) => item.trim()).filter(Boolean))
							onClose()
						}}
					>
						<CheckIcon />
					</button>
				</div>
			</div>
		</div>
	)
}
