import { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Note } from '@shared/types'
import { countWords, deriveNoteTitle, formatLastEdited } from '@renderer/src/domain/noteUtils'
import { TagsEditor } from './TagsEditor'
import { CheatSheetModal } from './CheatSheetModal'
import { ArchiveIcon, StarFilledIcon, StarOutlineIcon, TrashIcon } from './icons'

interface EditorPaneProps {
	note: Note | null
	content: string
	tags: Array<{ name: string; count: number }>
	saveState: 'idle' | 'saving' | 'saved' | 'failed'
	lastSavedAt: string | null
	onChangeDraft: (id: string, content: string) => void
	onFlush: (id: string) => Promise<void>
	onToggleStar: (id: string) => void
	onToggleArchive: (id: string) => void
	onDelete: (id: string) => void
	onSetTags: (tags: string[]) => void
}

const saveLabel = (state: string, last: string | null): string => {
	if ('saving' === state) return 'Saving…'
	if ('failed' === state) return 'Save failed'
	if (last) return `Saved ${formatLastEdited(last)}`
	return 'Saved'
}

export function EditorPane(props: EditorPaneProps) {
	const { note, content, tags, saveState, lastSavedAt, onChangeDraft, onFlush, onToggleStar, onToggleArchive, onDelete, onSetTags } = props
	const [showTagsEditor, setShowTagsEditor] = useState(false)
	const [showCheatSheet, setShowCheatSheet] = useState(false)
	const [showPreview, setShowPreview] = useState(false)
	const [previewWidth, setPreviewWidth] = useState(420)
	const debounceRef = useRef<number | null>(null)
	const noteIdRef = useRef<string | null>(null)
	const editorBodyRef = useRef<HTMLDivElement>(null)
	const isLightTheme = document.body.classList.contains('theme-light')

	useEffect(() => {
		if (noteIdRef.current && noteIdRef.current !== note?.id) {
			void onFlush(noteIdRef.current)
		}
		noteIdRef.current = note?.id ?? null
	}, [note?.id, onFlush])

	useEffect(() => {
		return () => {
			if (debounceRef.current) window.clearTimeout(debounceRef.current)
		}
	}, [])

	const existingTags = tags.map((item) => item.name)

	const startPreviewResize = (event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault()
		if (!editorBodyRef.current) return
		const bounds = editorBodyRef.current.getBoundingClientRect()
		const start_x = event.clientX
		const start_width = previewWidth

		const onMouseMove = (move_event: MouseEvent) => {
			const next_width = start_width - (move_event.clientX - start_x)
			const max_width = Math.max(320, bounds.width - 280)
			setPreviewWidth(Math.min(max_width, Math.max(280, next_width)))
		}

		const onMouseUp = () => {
			window.removeEventListener('mousemove', onMouseMove)
			window.removeEventListener('mouseup', onMouseUp)
		}

		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', onMouseUp)
	}

	if (!note) {
		return (
			<section className="editor empty-editor">
				<p>Select a note or create a new one.</p>
			</section>
		)
	}

	return (
		<section className="editor">
			<header className="editor-header">
				<h2>{deriveNoteTitle(content)}</h2>
				<div className="editor-actions">
					<span className="save-status">{saveLabel(saveState, lastSavedAt)}</span>
					<button className="icon-button" onClick={() => onToggleStar(note.id)} title="Toggle Star">{note.starred ? <StarFilledIcon /> : <StarOutlineIcon />}</button>
					<button className="icon-button" onClick={() => onToggleArchive(note.id)} title="Toggle Archive"><ArchiveIcon /></button>
					<button className="icon-button" onClick={() => onDelete(note.id)} title="Delete Note"><TrashIcon /></button>
					<button className="chip" onClick={() => setShowTagsEditor(true)}>Tags</button>
					<button className={`chip ${showPreview ? 'chip-active' : ''}`} onClick={() => setShowPreview((value) => !value)}>Preview</button>
				</div>
			</header>
			<div className="editor-body" ref={editorBodyRef} style={{ gridTemplateColumns: showPreview ? `minmax(0, 1fr) 6px minmax(280px, ${previewWidth}px)` : 'minmax(0, 1fr)' }}>
				<div className={`editor-input ${showPreview ? 'editor-input-split' : ''}`}>
					<CodeMirror
						value={content}
						height="100%"
						extensions={[markdown(), EditorView.lineWrapping]}
						theme={isLightTheme ? 'light' : oneDark}
						basicSetup={{
							lineNumbers: false,
							foldGutter: false,
						}}
						onChange={(value) => {
							onChangeDraft(note.id, value)
							if (debounceRef.current) window.clearTimeout(debounceRef.current)
							debounceRef.current = window.setTimeout(() => void onFlush(note.id), 420)
						}}
					/>
				</div>
				{showPreview && (
					<>
						<div className="panel-resizer panel-resizer-preview" onMouseDown={startPreviewResize} role="separator" aria-orientation="vertical" aria-label="Resize preview panel" />
						<article className="preview-panel preview-markdown">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
						</article>
					</>
				)}
			</div>
			<footer className="editor-footer">
				<span>{countWords(content)} words</span>
				<button className="icon-button" onClick={() => setShowCheatSheet(true)} title="Markdown Help">?</button>
			</footer>
			<TagsEditor open={showTagsEditor} currentTags={note.tags} existingTags={existingTags} onClose={() => setShowTagsEditor(false)} onApply={onSetTags} />
			<CheatSheetModal open={showCheatSheet} onClose={() => setShowCheatSheet(false)} />
		</section>
	)
}
