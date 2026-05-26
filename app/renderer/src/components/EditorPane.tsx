import { useCallback, useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import remarkGfm from 'remark-gfm'
import TurndownService from 'turndown'
import type { AiMessage, AiSearchResult, AiThreadSummary, Note } from '@shared/types'
import { countWords, deriveNoteTitle, formatLastEdited } from '@renderer/src/domain/noteUtils'
import { aiService } from '@renderer/src/services/aiService'
import { TagsEditor } from './TagsEditor'
import { ArchiveIcon, ChatbotIcon, CloseIcon, CopyIcon, ExportIcon, EyeIcon, PrinterIcon, SearchIcon, StarFilledIcon, StarOutlineIcon, TagIcon, TrashIcon } from './icons'
import { ChatPanel } from './ChatPanel'

interface EditorPaneProps {
	note: Note | null
	notes: Note[]
	openAiModel: string
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
	onOpenNoteFromChat: (note_id: string) => Promise<void>
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

const copyRichTextToClipboard = async (markdown_content: string): Promise<void> => {
	const html_fragment = renderMarkdownHtmlFragment(markdown_content)
	if (!navigator.clipboard) throw new Error('Clipboard API unavailable')

	if ('undefined' !== typeof ClipboardItem && navigator.clipboard.write) {
		const item = new ClipboardItem({
			'text/html': new Blob([html_fragment], { type: 'text/html' }),
			'text/plain': new Blob([markdown_content], { type: 'text/plain' }),
		})
		await navigator.clipboard.write([item])
		return
	}

	await navigator.clipboard.writeText(markdown_content)
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

const locateNextMatch = (content: string, query: string, start_at: number): number => {
	if (!query) return -1
	const direct_index = content.indexOf(query, start_at)
	if (-1 !== direct_index) return direct_index
	if (start_at > 0) return content.indexOf(query, 0)
	return -1
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
	const { note, notes, openAiModel, content, tags, saveState, lastSavedAt, onChangeDraft, onFlush, onToggleStar, onToggleArchive, onDelete, onSetTags, onOpenNoteFromChat } = props
	const [showTagsEditor, setShowTagsEditor] = useState(false)
	const [showPreview, setShowPreview] = useState(false)
	const [showChatPanel, setShowChatPanel] = useState(false)
	const [showExportMenu, setShowExportMenu] = useState(false)
	const [exportStatus, setExportStatus] = useState('')
	const [showSaveStatus, setShowSaveStatus] = useState(false)
	const [showFindReplace, setShowFindReplace] = useState(false)
	const [findQuery, setFindQuery] = useState('')
	const [replaceQuery, setReplaceQuery] = useState('')
	const [findReplaceStatus, setFindReplaceStatus] = useState('')
	const [previewWidth, setPreviewWidth] = useState<number | null>(null)
	const [chatThreads, setChatThreads] = useState<AiThreadSummary[]>([])
	const [chatThreadId, setChatThreadId] = useState<string | null>(null)
	const [chatMessages, setChatMessages] = useState<AiMessage[]>([])
	const [chatSearchQuery, setChatSearchQuery] = useState('')
	const [chatSearchResults, setChatSearchResults] = useState<AiSearchResult[]>([])
	const [chatLoadingThreads, setChatLoadingThreads] = useState(false)
	const [chatLoadingMessages, setChatLoadingMessages] = useState(false)
	const [chatSending, setChatSending] = useState(false)
	const [chatAssistantTyping, setChatAssistantTyping] = useState(false)
	const [chatDeleting, setChatDeleting] = useState(false)
	const [chatErrorMessage, setChatErrorMessage] = useState('')
	const debounceRef = useRef<number | null>(null)
	const exportStatusRef = useRef<number | null>(null)
	const saveStatusRef = useRef<number | null>(null)
	const noteIdRef = useRef<string | null>(null)
	const editorViewRef = useRef<EditorView | null>(null)
	const chatTypingIntervalRef = useRef<number | null>(null)
	const findInputRef = useRef<HTMLInputElement>(null)
	const editorBodyRef = useRef<HTMLDivElement>(null)
	const exportMenuRef = useRef<HTMLDivElement>(null)
	const [editingTitle, setEditingTitle] = useState(false)
	const [titleDraft, setTitleDraft] = useState('')
	const titleInputRef = useRef<HTMLInputElement>(null)
	const contentRef = useRef(content)
	contentRef.current = content
	const isLightTheme = document.body.classList.contains('theme-light')

	const updateH1InContent = useCallback((current_content: string, new_title: string): string => {
		const lines = current_content.split('\n')
		// Find first H1 line and replace it
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].startsWith('# ')) {
				lines[i] = `# ${new_title}`
				return lines.join('\n')
			}
		}
		// No H1 found — prepend one
		const trimmed = current_content.trimStart()
		const leading = current_content.slice(0, current_content.length - trimmed.length)
		return `${leading}# ${new_title}\n\n${trimmed}`
	}, [])

	const commitTitle = useCallback(() => {
		if (!note || !titleDraft.trim()) {
			setEditingTitle(false)
			return
		}
		const current_content = content
		const new_content = updateH1InContent(current_content, titleDraft.trim())
		onChangeDraft(note.id, new_content)
		setEditingTitle(false)
	}, [note, titleDraft, content, updateH1InContent, onChangeDraft])

	useEffect(() => {
		const openTags = () => setShowTagsEditor(true)
		const copyRich = () => void copyRichTextToClipboard(contentRef.current).catch(() => {})
		const togglePreview = () => setShowPreview((v) => { const n = !v; if (n) setShowChatPanel(false); return n })
		const toggleChat = () => setShowChatPanel((v) => { const n = !v; if (n) setShowPreview(false); return n })
		window.addEventListener('strata:open-tags-editor', openTags)
		window.addEventListener('strata:copy-rich-text', copyRich)
		window.addEventListener('strata:toggle-preview', togglePreview)
		window.addEventListener('strata:toggle-chat-panel', toggleChat)
		return () => {
			window.removeEventListener('strata:open-tags-editor', openTags)
			window.removeEventListener('strata:copy-rich-text', copyRich)
			window.removeEventListener('strata:toggle-preview', togglePreview)
			window.removeEventListener('strata:toggle-chat-panel', toggleChat)
		}
	}, [])

	useEffect(() => {
		if (editingTitle && titleInputRef.current) {
			titleInputRef.current.focus()
			titleInputRef.current.select()
		}
	}, [editingTitle])

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
			if (chatTypingIntervalRef.current) window.clearInterval(chatTypingIntervalRef.current)
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

	useEffect(() => {
		if (!showFindReplace) return
		window.setTimeout(() => {
			findInputRef.current?.focus()
			findInputRef.current?.select()
		}, 0)
	}, [showFindReplace])

	useEffect(() => {
		if (!showChatPanel) return
		let disposed = false
		setChatLoadingThreads(true)
		void aiService
			.listThreads()
			.then((threads) => {
				if (disposed) return
				setChatThreads(threads)
			})
			.catch((error) => {
				if (disposed) return
				setChatErrorMessage(error instanceof Error ? error.message : 'Failed to load chats')
			})
			.finally(() => {
				if (disposed) return
				setChatLoadingThreads(false)
			})

		return () => {
			disposed = true
		}
	}, [showChatPanel])

	useEffect(() => {
		if (!showChatPanel || !chatThreadId) {
			setChatMessages([])
			return
		}

		let disposed = false
		setChatLoadingMessages(true)
		void aiService
			.listMessages(chatThreadId)
			.then((messages) => {
				if (disposed) return
				setChatMessages(messages)
			})
			.catch((error) => {
				if (disposed) return
				setChatErrorMessage(error instanceof Error ? error.message : 'Failed to load messages')
			})
			.finally(() => {
				if (disposed) return
				setChatLoadingMessages(false)
			})

		return () => {
			disposed = true
		}
	}, [chatThreadId, showChatPanel])

	useEffect(() => {
		const openFindReplace = () => {
			const view = editorViewRef.current
			if (view) {
				const selection = view.state.selection.main
				if (selection.from !== selection.to) {
					setFindQuery(view.state.sliceDoc(selection.from, selection.to))
				}
			}
			setFindReplaceStatus('')
			setShowFindReplace(true)
		}

		window.addEventListener('strata:open-find-replace', openFindReplace)
		return () => window.removeEventListener('strata:open-find-replace', openFindReplace)
	}, [])

	const existingTags = tags.map((item) => item.name)
	const note_titles_by_id = notes.reduce<Record<string, string>>((carry, item) => {
		carry[item.id.toLowerCase()] = deriveNoteTitle(item.content)
		return carry
	}, {})
	const active_chat_model = chatThreadId
		? chatThreads.find((entry) => entry.thread.id === chatThreadId)?.thread.model || openAiModel
		: openAiModel
	const showSidePanel = showPreview || showChatPanel

	const stopAssistantTypingAnimation = () => {
		if (chatTypingIntervalRef.current) {
			window.clearInterval(chatTypingIntervalRef.current)
			chatTypingIntervalRef.current = null
		}
		setChatAssistantTyping(false)
	}

	const findNextMatch = () => {
		const view = editorViewRef.current
		if (!view || !findQuery) {
			setFindReplaceStatus(findQuery ? 'Editor is unavailable' : 'Enter text to find')
			return false
		}

		const doc_content = view.state.doc.toString()
		const selection_end = view.state.selection.main.to
		const next_index = locateNextMatch(doc_content, findQuery, selection_end)
		if (-1 === next_index) {
			setFindReplaceStatus('No matches found')
			return false
		}

		view.dispatch({
			selection: { anchor: next_index, head: next_index + findQuery.length },
			scrollIntoView: true,
		})
		view.focus()
		setFindReplaceStatus('Match selected')
		return true
	}

	const replaceSelection = () => {
		const view = editorViewRef.current
		if (!view || !findQuery) {
			setFindReplaceStatus(findQuery ? 'Editor is unavailable' : 'Enter text to find')
			return
		}

		const selection = view.state.selection.main
		const selected_text = view.state.sliceDoc(selection.from, selection.to)

		if (selected_text !== findQuery) {
			if (!findNextMatch()) return
		}

		const active_selection = view.state.selection.main
		view.dispatch({
			changes: { from: active_selection.from, to: active_selection.to, insert: replaceQuery },
			selection: EditorSelection.cursor(active_selection.from + replaceQuery.length),
			scrollIntoView: true,
		})
		view.focus()
		setFindReplaceStatus('Replaced one match')
		window.setTimeout(() => {
			findNextMatch()
		}, 0)
	}

	const replaceAllMatches = () => {
		const view = editorViewRef.current
		if (!view || !findQuery) {
			setFindReplaceStatus(findQuery ? 'Editor is unavailable' : 'Enter text to find')
			return
		}

		const doc_content = view.state.doc.toString()
		let match_count = 0
		let search_from = 0
		let found_at = doc_content.indexOf(findQuery, search_from)
		while (-1 !== found_at) {
			match_count += 1
			search_from = found_at + findQuery.length
			found_at = doc_content.indexOf(findQuery, search_from)
		}

		if (0 === match_count) {
			setFindReplaceStatus('No matches found')
			return
		}

		const updated_content = doc_content.split(findQuery).join(replaceQuery)
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: updated_content },
			selection: EditorSelection.cursor(0),
			scrollIntoView: true,
		})
		view.focus()
		setFindReplaceStatus(`Replaced ${match_count} match${1 === match_count ? '' : 'es'}`)
	}

	const onFindReplaceInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if ('Escape' === event.key) {
			event.preventDefault()
			setShowFindReplace(false)
			return
		}

		if ('Enter' !== event.key || event.shiftKey) return
		event.preventDefault()
		if (findInputRef.current === event.currentTarget) {
			findNextMatch()
			return
		}
		replaceSelection()
	}

	const startPreviewResize = (event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault()
		if (!editorBodyRef.current) return
		const bounds = editorBodyRef.current.getBoundingClientRect()
		const start_x = event.clientX
		const start_width = null !== previewWidth ? previewWidth : Math.max(280, (bounds.width - 6) / 2)

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

	const copyRichText = async () => {
		try {
			await copyRichTextToClipboard(content)
			setExportStatus('Rich text copied')
			if (exportStatusRef.current) window.clearTimeout(exportStatusRef.current)
			exportStatusRef.current = window.setTimeout(() => setExportStatus(''), 3000)
		} catch {
			setExportStatus('Rich text copy failed')
			if (exportStatusRef.current) window.clearTimeout(exportStatusRef.current)
			exportStatusRef.current = window.setTimeout(() => setExportStatus(''), 3000)
		}
	}

	const printNote = async () => {
		const title = sanitizeFileName(deriveNoteTitle(content))
		const html = renderStyledMarkdownHtml(title, content)

		try {
			await window.strata.exports.print({ html })
			setExportStatus('Print dialog opened')
			if (exportStatusRef.current) window.clearTimeout(exportStatusRef.current)
			exportStatusRef.current = window.setTimeout(() => setExportStatus(''), 3000)
		} catch {
			setExportStatus('Print failed')
			if (exportStatusRef.current) window.clearTimeout(exportStatusRef.current)
			exportStatusRef.current = window.setTimeout(() => setExportStatus(''), 3000)
		}
	}

	const refreshChatThreads = async () => {
		const threads = await aiService.listThreads()
		setChatThreads(threads)
	}

	const sendChatMessage = async (message: string) => {
		if (chatSending || chatAssistantTyping) return
		setChatErrorMessage('')
		setChatSending(true)
		const optimistic_message: AiMessage = {
			id: `optimistic-${Date.now()}`,
			threadId: chatThreadId ?? 'pending',
			role: 'user',
			content: message,
			createdAt: new Date().toISOString(),
		}
		setChatMessages((current) => [...current, optimistic_message])

		try {
			const response = await aiService.sendMessage({
				threadId: chatThreadId ?? undefined,
				message,
			})
			setChatThreadId(response.thread.id)
			await refreshChatThreads()

			const persisted_messages = await aiService.listMessages(response.thread.id)
			const base_messages = persisted_messages.filter((item) => item.id !== response.message.id)
			const animated_message: AiMessage = { ...response.message, content: '' }
			setChatMessages([...base_messages, animated_message])
			setChatAssistantTyping(true)

			const full_content = response.message.content
			let cursor = 0
			const step = Math.max(1, Math.ceil(full_content.length / 140))

			await new Promise<void>((resolve) => {
				stopAssistantTypingAnimation()
				chatTypingIntervalRef.current = window.setInterval(() => {
					cursor = Math.min(full_content.length, cursor + step)
					setChatMessages([...base_messages, { ...animated_message, content: full_content.slice(0, cursor) }])
					if (cursor >= full_content.length) {
						stopAssistantTypingAnimation()
						setChatMessages(persisted_messages)
						resolve()
					}
				}, 16)
			})
		} catch (error) {
			stopAssistantTypingAnimation()
			setChatMessages((current) => current.filter((item) => item.id !== optimistic_message.id))
			setChatErrorMessage(error instanceof Error ? error.message : 'Failed to send chat message')
		} finally {
			setChatSending(false)
		}
	}

	const runChatSearch = async () => {
		const query = chatSearchQuery.trim()
		if (!query) {
			setChatSearchResults([])
			return
		}
		setChatErrorMessage('')
		try {
			setChatSearchResults(await aiService.searchChats(query))
		} catch (error) {
			setChatErrorMessage(error instanceof Error ? error.message : 'Failed to search previous chats')
		}
	}

	const deleteSelectedChatThread = async () => {
		if (!chatThreadId) return
		stopAssistantTypingAnimation()
		setChatErrorMessage('')
		setChatDeleting(true)

		try {
			const deleted = await aiService.deleteThread(chatThreadId)
			if (!deleted) {
				setChatErrorMessage('Chat could not be deleted')
				return
			}

			const threads = await aiService.listThreads()
			setChatThreads(threads)
			setChatSearchResults((current) => current.filter((item) => item.thread.id !== chatThreadId))

			if (threads[0]) {
				setChatThreadId(threads[0].thread.id)
			} else {
				setChatThreadId(null)
				setChatMessages([])
			}
		} catch (error) {
			setChatErrorMessage(error instanceof Error ? error.message : 'Failed to delete chat')
		} finally {
			setChatDeleting(false)
		}
	}

	const toolbar_status = exportStatus || (showSaveStatus ? saveLabel(saveState, lastSavedAt) : '')

	return (
		<section className="editor">
			<header className="editor-header">
				{editingTitle ? (
					<input
						ref={titleInputRef}
						className="editor-title-input"
						value={titleDraft}
						onChange={(event) => setTitleDraft(event.target.value)}
						onBlur={() => commitTitle()}
						onKeyDown={(event) => {
							if ('Enter' === event.key) {
								event.preventDefault()
								commitTitle()
							}
							if ('Escape' === event.key) {
								event.preventDefault()
								setEditingTitle(false)
							}
						}}
					/>
				) : (
					<h2
						className="editor-title-text"
						onClick={() => {
							setTitleDraft(deriveNoteTitle(content))
							setEditingTitle(true)
						}}
						title="Click to edit title"
					>
						{deriveNoteTitle(content)}
					</h2>
				)}
				<div className="editor-actions">
					{toolbar_status && <span className="save-status">{toolbar_status}</span>}
					<button className="icon-button" onClick={() => void copyRichText()} title="Copy Rich Text"><CopyIcon /></button>
					<button className="icon-button" onClick={() => onToggleStar(note.id)} title="Toggle Star">{note.starred ? <StarFilledIcon /> : <StarOutlineIcon />}</button>
					<button className="icon-button" onClick={() => setShowTagsEditor(true)} title="Tags"><TagIcon /></button>
					<button className={`icon-button ${showPreview ? 'chip-active' : ''}`} onClick={() => {
						setShowPreview((value) => {
							const next = !value
							if (next) setShowChatPanel(false)
							return next
						})
					}} title="Preview"><EyeIcon /></button>
					<button className={`icon-button ${showChatPanel ? 'chip-active' : ''}`} onClick={() => {
						setShowChatPanel((value) => {
							const next = !value
							if (next) {
								setShowPreview(false)
								setChatThreadId(null)
								setChatMessages([])
								setChatSearchResults([])
								setChatSearchQuery('')
								setChatErrorMessage('')
							}
							return next
						})
					}} title="Open AI Chat"><ChatbotIcon /></button>
				</div>
			</header>
			<div className="editor-body" ref={editorBodyRef} style={{ gridTemplateColumns: showSidePanel ? (null === previewWidth ? 'minmax(0, 1fr) 6px minmax(0, 1fr)' : `minmax(0, 1fr) 6px minmax(280px, ${previewWidth}px)`) : 'minmax(0, 1fr)' }}>
				<div className={`editor-input ${showSidePanel ? 'editor-input-split' : ''}`}>
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
				{showSidePanel && (
					<>
						<div className="panel-resizer panel-resizer-preview" onMouseDown={startPreviewResize} role="separator" aria-orientation="vertical" aria-label={showChatPanel ? 'Resize chat panel' : 'Resize preview panel'} />
						{showChatPanel ? (
							<ChatPanel
								threads={chatThreads}
								activeThreadId={chatThreadId}
								messages={chatMessages}
								modelName={active_chat_model}
								noteTitlesById={note_titles_by_id}
								searchQuery={chatSearchQuery}
								searchResults={chatSearchResults}
								loadingThreads={chatLoadingThreads}
								loadingMessages={chatLoadingMessages}
								sending={chatSending}
								assistantTyping={chatAssistantTyping}
								deleting={chatDeleting}
								errorMessage={chatErrorMessage}
								onSelectThread={(thread_id) => {
									stopAssistantTypingAnimation()
									if (!thread_id) {
										setChatThreadId(null)
										setChatMessages([])
										return
									}
									setChatThreadId(thread_id)
									setChatSearchResults([])
								}}
								onCreateThread={() => {
									stopAssistantTypingAnimation()
									setChatThreadId(null)
									setChatMessages([])
									setChatSearchResults([])
									setChatErrorMessage('')
								}}
								onDeleteThread={deleteSelectedChatThread}
								onSearchQueryChange={setChatSearchQuery}
								onRunSearch={() => void runChatSearch()}
								onClearSearch={() => {
									setChatSearchQuery('')
									setChatSearchResults([])
								}}
								onSendMessage={sendChatMessage}
								onOpenNote={(note_id) => {
									void onOpenNoteFromChat(note_id)
								}}
							/>
						) : (
							<article className="preview-panel preview-markdown">
								<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
							</article>
						)}
					</>
				)}
			</div>
			<footer className="editor-footer">
				<span>{countWords(content)} words</span>
				<div className="editor-footer-actions">
					<button className={`icon-button ${showFindReplace ? 'chip-active' : ''}`} onClick={() => {
						setFindReplaceStatus('')
						setShowFindReplace(true)
					}} title="Find and Replace"><SearchIcon /></button>
					<div className="toolbar-menu toolbar-menu-footer" ref={exportMenuRef}>
						<button className={`icon-button ${showExportMenu ? 'chip-active' : ''}`} onClick={() => setShowExportMenu((value) => !value)} title="Export Note"><ExportIcon /></button>
						{showExportMenu && (
							<div className="editor-export-menu">
								<button onClick={() => void exportNote('md')}>.md</button>
								<button onClick={() => void exportNote('pdf')}>.pdf</button>
								<button onClick={() => void exportNote('doc')}>.doc</button>
							</div>
						)}
					</div>
					<button className="icon-button" onClick={() => void printNote()} title="Print Note"><PrinterIcon /></button>
					<button className="icon-button" onClick={() => onToggleArchive(note.id)} title="Toggle Archive"><ArchiveIcon /></button>
					<button className="icon-button" onClick={() => onDelete(note.id)} title="Delete Note"><TrashIcon /></button>
				</div>
			</footer>
			{showFindReplace && (
				<div className="modal-overlay" onClick={() => setShowFindReplace(false)}>
					<div className="modal-card find-replace-modal" onClick={(event) => event.stopPropagation()}>
						<button className="icon-button modal-close-button" onClick={() => setShowFindReplace(false)} aria-label="Close find and replace" title="Close find and replace">
							<CloseIcon />
						</button>
						<h3>Find and replace</h3>
						<label className="find-replace-field">
							Find
							<input
								ref={findInputRef}
								className="search-input"
								value={findQuery}
								onChange={(event) => setFindQuery(event.target.value)}
								onKeyDown={onFindReplaceInputKeyDown}
							/>
						</label>
						<label className="find-replace-field">
							Replace with
							<input
								className="search-input"
								value={replaceQuery}
								onChange={(event) => setReplaceQuery(event.target.value)}
								onKeyDown={onFindReplaceInputKeyDown}
							/>
						</label>
						{findReplaceStatus && <p className="find-replace-status">{findReplaceStatus}</p>}
						<div className="modal-actions find-replace-actions">
							<button className="ghost-button" onClick={findNextMatch}>Find next</button>
							<button className="ghost-button" onClick={replaceSelection}>Replace</button>
							<button className="primary-button" onClick={replaceAllMatches}>Replace all</button>
						</div>
					</div>
				</div>
			)}
			<TagsEditor open={showTagsEditor} currentTags={note.tags} existingTags={existingTags} onClose={() => setShowTagsEditor(false)} onApply={onSetTags} />
		</section>
	)
}
