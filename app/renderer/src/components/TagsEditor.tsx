import { useEffect, useMemo, useRef, useState } from 'react'
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
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (open) {
			setValue(currentTags.join(', '))
			window.setTimeout(() => inputRef.current?.focus(), 0)
		}
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
				<input
					ref={inputRef}
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if ('Enter' === event.key) {
							event.preventDefault()
							onApply(value.split(',').map((item) => item.trim()).filter(Boolean))
							onClose()
						}
					}}
					placeholder="comma,separated,tags"
				/>
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
