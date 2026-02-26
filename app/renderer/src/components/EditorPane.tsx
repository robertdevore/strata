import { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import remarkGfm from 'remark-gfm'
import TurndownService from 'turndown'
import type { Note } from '@shared/types'
import { countWords, deriveNoteTitle, formatLastEdited } from '@renderer/src/domain/noteUtils'
import { TagsEditor } from './TagsEditor'
import { CheatSheetModal } from './CheatSheetModal'
import { ArchiveIcon, ExportIcon, EyeIcon, StarFilledIcon, StarOutlineIcon, TagIcon, TrashIcon } from './icons'

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

const sanitizeFileName = (value: string): string => {
	const cleaned = value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
	return cleaned || 'untitled-note'
}

const triggerDownload = (blob: Blob, file_name: string) => {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = file_name
	document.body.appendChild(link)
	link.click()
	link.remove()
	URL.revokeObjectURL(url)
}

const renderMarkdownHtmlFragment = (markdown_content: string): string => {
	return renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown_content || ''}</ReactMarkdown>)
}

const renderStyledMarkdownHtml = (title: string, markdown_content: string): string => {
	const html_content = renderMarkdownHtmlFragment(markdown_content)

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2730; margin: 32px; }
h1,h2,h3,h4,h5,h6 { margin: 0 0 10px; line-height: 1.3; color: #0f1820; }
p,ul,ol,blockquote,pre { margin: 0 0 10px; line-height: 1.55; }
ul,ol { padding-left: 24px; }
code { background: #eef1f4; border: 1px solid #d6dbe0; border-radius: 6px; padding: 0 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
pre code { display: block; padding: 10px; white-space: pre-wrap; }
blockquote { border-left: 3px solid #d6dbe0; padding-left: 12px; color: #5a6670; }
a { color: #3c6e8f; }
table { border-collapse: collapse; width: 100%; margin: 0 0 10px; }
th,td { border: 1px solid #d6dbe0; padding: 6px 8px; text-align: left; }
</style>
</head>
<body>
${html_content}
</body>
</html>`
}

const exportAsPdf = async (title: string, markdown_content: string) => {
	const html = renderStyledMarkdownHtml(title, markdown_content)
	const pdf_bytes = await window.strata.exports.pdf({ html })
	const pdf_data = pdf_bytes instanceof Uint8Array ? pdf_bytes : new Uint8Array(pdf_bytes)
	const pdf_array = Uint8Array.from(pdf_data)
	const output_title = sanitizeFileName(title)
	triggerDownload(new Blob([pdf_array.buffer], { type: 'application/pdf' }), `${output_title}.pdf`)
}

const exportAsDoc = (title: string, markdown_content: string) => {
	const html = renderStyledMarkdownHtml(title, markdown_content)
	const output_title = sanitizeFileName(title)
	triggerDownload(new Blob([html], { type: 'application/msword;charset=utf-8' }), `${output_title}.doc`)
}

const turndown_service = new TurndownService({
	headingStyle: 'atx',
	codeBlockStyle: 'fenced',
	bulletListMarker: '-',
	emDelimiter: '*',
})

turndown_service.keep(['u'])

const convertRichTextToMarkdown = (html_content: string): string => {
	try {
		return turndown_service.turndown(html_content).trimEnd()
	} catch {
		return ''
	}
}

const richTextPasteExtension = EditorView.domEventHandlers({
	paste: (event, view) => {
		const html_content = event.clipboardData?.getData('text/html') ?? ''
		if (!html_content.trim()) return false

		const markdown_content = convertRichTextToMarkdown(html_content)
		if (!markdown_content) return false

		const transaction = view.state.changeByRange((range) => ({
			changes: { from: range.from, to: range.to, insert: markdown_content },
			range: EditorSelection.cursor(range.from + markdown_content.length),
		}))

		view.dispatch(transaction)
		event.preventDefault()
		return true
	},
})

export function EditorPane(props: EditorPaneProps) {
	const { note, content, tags, saveState, lastSavedAt, onChangeDraft, onFlush, onToggleStar, onToggleArchive, onDelete, onSetTags } = props
	const [showTagsEditor, setShowTagsEditor] = useState(false)
	const [showCheatSheet, setShowCheatSheet] = useState(false)
	const [showPreview, setShowPreview] = useState(false)
	const [showExportMenu, setShowExportMenu] = useState(false)
	const [exportStatus, setExportStatus] = useState('')
	const [showSaveStatus, setShowSaveStatus] = useState(false)
	const [previewWidth, setPreviewWidth] = useState(420)
	const debounceRef = useRef<number | null>(null)
	const exportStatusRef = useRef<number | null>(null)
	const saveStatusRef = useRef<number | null>(null)
	const noteIdRef = useRef<string | null>(null)
	const editorViewRef = useRef<EditorView | null>(null)
	const editorBodyRef = useRef<HTMLDivElement>(null)
	const exportMenuRef = useRef<HTMLDivElement>(null)
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
			if (exportStatusRef.current) window.clearTimeout(exportStatusRef.current)
			if (saveStatusRef.current) window.clearTimeout(saveStatusRef.current)
		}
	}, [])

	useEffect(() => {
		if ('saving' === saveState || 'failed' === saveState) {
			if (saveStatusRef.current) window.clearTimeout(saveStatusRef.current)
			window.setTimeout(() => setShowSaveStatus(true), 0)
			return
		}

		if ('saved' === saveState) {
			if (saveStatusRef.current) window.clearTimeout(saveStatusRef.current)
			window.setTimeout(() => setShowSaveStatus(true), 0)
			saveStatusRef.current = window.setTimeout(() => setShowSaveStatus(false), 3000)
			return
		}

		if ('idle' === saveState && !lastSavedAt) {
			window.setTimeout(() => setShowSaveStatus(false), 0)
		}
	}, [saveState, lastSavedAt])

	useEffect(() => {
		if (!showExportMenu) return

		const onPointerDown = (event: MouseEvent) => {
			if (!exportMenuRef.current) return
			if (event.target instanceof Node && !exportMenuRef.current.contains(event.target)) {
				setShowExportMenu(false)
			}
		}

		window.addEventListener('mousedown', onPointerDown)
		return () => window.removeEventListener('mousedown', onPointerDown)
	}, [showExportMenu])

	useEffect(() => {
		if (!note || '# Untitled\n\n' !== content) return
		window.setTimeout(() => {
			if (!editorViewRef.current) return
			const cursor_position = content.length
			editorViewRef.current.dispatch({
				selection: { anchor: cursor_position },
				scrollIntoView: true,
			})
			editorViewRef.current.focus()
		}, 0)
	}, [note, content])

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

	const exportNote = async (format: 'md' | 'pdf' | 'doc') => {
		const title = sanitizeFileName(deriveNoteTitle(content))
		try {
			if ('md' === format) {
				triggerDownload(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${title}.md`)
			}
			if ('doc' === format) {
				exportAsDoc(title, content)
			}
			if ('pdf' === format) {
				await exportAsPdf(title, content)
			}

			setExportStatus(`Exported as .${format}`)
			if (exportStatusRef.current) window.clearTimeout(exportStatusRef.current)
			exportStatusRef.current = window.setTimeout(() => setExportStatus(''), 3000)
		} catch {
			setExportStatus(`Export failed (.${format})`)
			if (exportStatusRef.current) window.clearTimeout(exportStatusRef.current)
			exportStatusRef.current = window.setTimeout(() => setExportStatus(''), 3000)
		}

		setShowExportMenu(false)
	}

	const toolbar_status = exportStatus || (showSaveStatus ? saveLabel(saveState, lastSavedAt) : '')

	return (
		<section className="editor">
			<header className="editor-header">
				<h2>{deriveNoteTitle(content)}</h2>
				<div className="editor-actions">
					{toolbar_status && <span className="save-status">{toolbar_status}</span>}
					<button className="icon-button" onClick={() => onToggleStar(note.id)} title="Toggle Star">{note.starred ? <StarFilledIcon /> : <StarOutlineIcon />}</button>
					<button className="icon-button" onClick={() => onToggleArchive(note.id)} title="Toggle Archive"><ArchiveIcon /></button>
					<button className="icon-button" onClick={() => onDelete(note.id)} title="Delete Note"><TrashIcon /></button>
					<div className="toolbar-menu" ref={exportMenuRef}>
						<button className={`icon-button ${showExportMenu ? 'chip-active' : ''}`} onClick={() => setShowExportMenu((value) => !value)} title="Export Note"><ExportIcon /></button>
						{showExportMenu && (
							<div className="editor-export-menu">
								<button onClick={() => void exportNote('md')}>.md</button>
								<button onClick={() => void exportNote('pdf')}>.pdf</button>
								<button onClick={() => void exportNote('doc')}>.doc</button>
							</div>
						)}
					</div>
					<button className="icon-button" onClick={() => setShowTagsEditor(true)} title="Tags"><TagIcon /></button>
					<button className={`icon-button ${showPreview ? 'chip-active' : ''}`} onClick={() => setShowPreview((value) => !value)} title="Preview"><EyeIcon /></button>
				</div>
			</header>
			<div className="editor-body" ref={editorBodyRef} style={{ gridTemplateColumns: showPreview ? `minmax(0, 1fr) 6px minmax(280px, ${previewWidth}px)` : 'minmax(0, 1fr)' }}>
				<div className={`editor-input ${showPreview ? 'editor-input-split' : ''}`}>
					<CodeMirror
						value={content}
						height="100%"
						extensions={[markdown(), EditorView.lineWrapping, richTextPasteExtension]}
						onCreateEditor={(view) => {
							editorViewRef.current = view
						}}
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
