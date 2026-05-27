import { Children, useCallback, useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'
import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import remarkGfm from 'remark-gfm'
import TurndownService from 'turndown'
import type { AiMessage, AiSearchResult, AiThreadSummary, Note } from '@shared/types'
import { countWords, deriveNoteTitle, formatLastEdited } from '@renderer/src/domain/noteUtils'
import { aiService } from '@renderer/src/services/aiService'
import { TagsEditor } from './TagsEditor'
import { ArchiveIcon, ChatbotIcon, CirclesRelationIcon, CloseIcon, CopyIcon, EyeIcon, FileSearchIcon, FileTextAiIcon, PrinterIcon, StarFilledIcon, StarOutlineIcon, TagIcon, TrashIcon, UploadIcon } from './icons'
import { ChatPanel } from './ChatPanel'
import { PublishModal } from './PublishModal'

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
	onOpenNoteFromChat: (note_id: string, new_tab?: boolean) => Promise<void>
	onShowRelatedNotes: () => void
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

// Auto-strip leading H1 when pasting into an empty note — the H1 becomes the title
const h1AutoStripExtension = EditorView.domEventHandlers({
	paste: (event, view) => {
		const plain_text = event.clipboardData?.getData('text/plain') ?? ''
		if (!plain_text.trim()) return false

		// Check if the note is currently empty (just the auto-generated H1 or blank)
		const current_doc = view.state.doc.toString()
		const doc_is_empty = !current_doc.trim() || /^#\s[^\n]*\n?\n?$/.test(current_doc.trim())

		// Check if the pasted text starts with an H1
		const lines = plain_text.split('\n')
		const first_line = lines[0]?.trim() ?? ''
		if (!doc_is_empty || !first_line.startsWith('# ')) return false

		// Strip the H1 and any blank line after it
		let new_body = plain_text
		if (lines[1] === '') {
			new_body = lines.slice(2).join('\n')
		} else {
			new_body = lines.slice(1).join('\n')
		}

		// Replace the entire document with the body only
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: new_body },
			selection: { anchor: 0 },
		})
		event.preventDefault()
		return true
	},
})

export function EditorPane(props: EditorPaneProps) {
	const { note, notes, openAiModel, content, tags, saveState, lastSavedAt, onChangeDraft, onFlush, onToggleStar, onToggleArchive, onDelete, onSetTags, onOpenNoteFromChat, onShowRelatedNotes } = props
	const [showTagsEditor, setShowTagsEditor] = useState(false)
	const [showPreview, setShowPreview] = useState(false)
	const [showChatPanel, setShowChatPanel] = useState(false)
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
	const [backlinks, setBacklinks] = useState<Array<{ link: import('@shared/types').NoteLink; source: import('@shared/types').Note }>>([])
	const [showBacklinks, setShowBacklinks] = useState(false)
	const [showRelatedPreview, setShowRelatedPreview] = useState(false)
	const [relatedNotes, setRelatedNotes] = useState<Array<{ note: import('@shared/types').Note; reason: string; score: number }>>([])
	const [showAiHistory, setShowAiHistory] = useState(false)
	const [aiEdits, setAiEdits] = useState<Array<import('@shared/types').AiNoteEdit>>([])
	const [showPublish, setShowPublish] = useState(false)
	const [copyToast, setCopyToast] = useState(false)
	const [inlineFindQuery, setInlineFindQuery] = useState('')
	const [showInlineFind, setShowInlineFind] = useState(false)
	const [inlineFindCount, setInlineFindCount] = useState(0)
	const [inlineFindIndex, setInlineFindIndex] = useState(0)
	const debounceRef = useRef<number | null>(null)
	const saveStatusRef = useRef<number | null>(null)
	const noteIdRef = useRef<string | null>(null)
	const editorViewRef = useRef<EditorView | null>(null)
	const chatTypingIntervalRef = useRef<number | null>(null)
	const findInputRef = useRef<HTMLInputElement>(null)
	const editorBodyRef = useRef<HTMLDivElement>(null)
	const [editingTitle, setEditingTitle] = useState(false)
	const [titleDraft, setTitleDraft] = useState('')
	const titleInputRef = useRef<HTMLInputElement>(null)
	const contentRef = useRef(content)
	contentRef.current = content
	const isLightTheme = document.body.classList.contains('theme-light')

	// Derive current title from full content (with H1)
	const currentTitle = deriveNoteTitle(content)

	// Strip leading H1 for editor display — editor shows body only
	const stripLeadingH1 = (full: string): string => {
		const lines = full.split('\n')
		if (lines[0] && lines[0].startsWith('# ')) {
			// Remove the H1 line and one following blank line if present
			if (lines[1] === '') return lines.slice(2).join('\n')
			return lines.slice(1).join('\n')
		}
		return full
	}
	const editorContent = stripLeadingH1(content)

	// Wrap body content with H1 for storage
	const fullContentWithTitle = useCallback((body: string, title: string): string => {
		return `# ${title}\n\n${body}`
	}, [])

	const commitTitle = useCallback(() => {
		if (!note || !titleDraft.trim()) {
			setEditingTitle(false)
			return
		}
		const new_title = titleDraft.trim()
		const body = stripLeadingH1(content)
		const new_content = fullContentWithTitle(body, new_title)
		onChangeDraft(note.id, new_content)
		// Trigger the same debounced flush as the editor
		if (debounceRef.current) window.clearTimeout(debounceRef.current)
		debounceRef.current = window.setTimeout(() => void onFlush(note.id), 420)
		setEditingTitle(false)
	}, [note, titleDraft, content, fullContentWithTitle, onChangeDraft, onFlush])

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
		// Load backlinks for the current note
		if (note?.id) {
			try {
				window.strata.links.backlinks(note.id).then(setBacklinks).catch(() => setBacklinks([]))
				window.strata.links.relatedNotes(note.id).then(setRelatedNotes).catch(() => setRelatedNotes([]))
			} catch {
				setBacklinks([])
				setRelatedNotes([])
			}
		} else {
			setBacklinks([])
			setRelatedNotes([])
		}
	}, [note?.id, onFlush])

	useEffect(() => {
		return () => {
			if (debounceRef.current) window.clearTimeout(debounceRef.current)
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
		if (!note || '' !== content.trim()) return
		// New empty note — focus the editor at position 0
		window.setTimeout(() => {
			if (!editorViewRef.current) return
			editorViewRef.current.dispatch({
				selection: { anchor: 0 },
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

	// Inline find — Cmd/Ctrl+F
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && 'f' === event.key && !event.shiftKey) {
				event.preventDefault()
				const view = editorViewRef.current
				if (view) {
					const selection = view.state.selection.main
					if (selection.from !== selection.to) {
						setInlineFindQuery(view.state.sliceDoc(selection.from, selection.to))
					}
				}
				setShowInlineFind((v) => {
					if (!v) return true
					return true // already open, just refocus
				})
				// Focus the inline find input
				window.setTimeout(() => {
					const el = document.querySelector('.inline-find-input') as HTMLInputElement | null
					el?.focus()
					el?.select()
				}, 10)
			}
			if ('Escape' === event.key && showInlineFind) {
				event.preventDefault()
				setShowInlineFind(false)
				setInlineFindQuery('')
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [showInlineFind])

	// Inline find match counting
	useEffect(() => {
		if (!inlineFindQuery || !showInlineFind) {
			setInlineFindCount(0)
			setInlineFindIndex(0)
			return
		}
		const escaped = inlineFindQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const regex = new RegExp(escaped, 'gi')
		const matches = content.match(regex)
		setInlineFindCount(matches ? matches.length : 0)
		setInlineFindIndex(0)
	}, [inlineFindQuery, content, showInlineFind])

	const handleInlineFindNext = () => {
		if (!inlineFindQuery || !editorViewRef.current) return
		const view = editorViewRef.current
		const doc = view.state.doc.toString()
		const escaped = inlineFindQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const regex = new RegExp(escaped, 'gi')
		const matches = [...doc.matchAll(regex)]
		if (!matches.length) return
		const nextIdx = (inlineFindIndex + 1) % matches.length
		setInlineFindIndex(nextIdx)
		const match = matches[nextIdx]
		view.dispatch({
			selection: { anchor: match.index, head: match.index + match[0].length },
			scrollIntoView: true,
		})
	}

	const handleInlineFindPrev = () => {
		if (!inlineFindQuery || !editorViewRef.current) return
		const view = editorViewRef.current
		const doc = view.state.doc.toString()
		const escaped = inlineFindQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const regex = new RegExp(escaped, 'gi')
		const matches = [...doc.matchAll(regex)]
		if (!matches.length) return
		const prevIdx = (inlineFindIndex - 1 + matches.length) % matches.length
		setInlineFindIndex(prevIdx)
		const match = matches[prevIdx]
		view.dispatch({
			selection: { anchor: match.index, head: match.index + match[0].length },
			scrollIntoView: true,
		})
	}

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

	// Wiki link autocomplete source for CodeMirror — must be before any early return
	const wikiLinkCompletions = useCallback(
		(context: CompletionContext) => {
			const pos = context.pos
			const line = context.state.doc.lineAt(pos)
			const text_before = line.text.slice(0, pos - line.from)
			// Find the start of [[... pattern
			const bracket_idx = text_before.lastIndexOf('[[')
			if (-1 === bracket_idx) return null
			const after_brackets = text_before.slice(bracket_idx + 2)
			// Only activate if no closing ]] between [[ and cursor
			if (after_brackets.includes(']]')) return null
			const partial = after_brackets.trim().toLowerCase()
			// from = position of [[ in document
			const from = line.from + bracket_idx

			const matching = notes
				.filter((n) => {
					const title = deriveNoteTitle(n.content)
					return title.toLowerCase().includes(partial)
				})
				.slice(0, 8)
				.map((n) => {
					const title = deriveNoteTitle(n.content)
					return {
						label: title,
						type: 'text' as const,
						apply: `[[${title}]]`,
						detail: 'note',
					}
				})

			if (matching.length === 0) return null
			return { from, options: matching, filter: false }
		},
		[notes],
	)

	if (!note) {
		return (
			<section className="editor empty-editor">
				<p>Select a note or create a new one.</p>
			</section>
		)
	}

	const printNote = async () => {
		const title = sanitizeFileName(deriveNoteTitle(content))
		const html = renderStyledMarkdownHtml(title, content)

		try {
			await window.strata.exports.print({ html })
		} catch {
			// Print dialog was cancelled or failed — nothing to do
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

	const toolbar_status = showSaveStatus ? saveLabel(saveState, lastSavedAt) : ''

	// Convert [[wiki links]] to standard markdown links for preview rendering
	const wikiLinkToMarkdown = (md: string): string => {
		// Protect inline code spans and fenced code blocks from wiki link conversion
		const code_spans: string[] = []
		const protected_md = md
			// Protect fenced code blocks
			.replace(/```[\s\S]*?```/g, (match) => {
				code_spans.push(match)
				return `\x00CODE${code_spans.length - 1}\x00`
			})
			// Protect inline code spans
			.replace(/`[^`]+`/g, (match) => {
				code_spans.push(match)
				return `\x00CODE${code_spans.length - 1}\x00`
			})

		// Convert [[wiki links]] to standard markdown links (only outside code)
		const converted = protected_md.replace(/(?<!!)\[\[([^\]|#\n]{1,120})(?:#([^\]|\n]{1,80}))?(?:\|([^\]\n]{1,120}))?\]\]/g, (_full, target: string, heading: string | undefined, label: string | undefined) => {
			const display = (label ?? target).trim()
			const encoded = encodeURIComponent(target.trim())
			const fragment = heading ? `#${encodeURIComponent(heading.trim())}` : ''
			return `[${display}](#strata-note:${encoded}${fragment})`
		})

		// Restore code spans
		return converted.replace(/\x00CODE(\d+)\x00/g, (_m, idx) => code_spans[Number(idx)] ?? '')
	}

	// Handle clicks on wiki links in the preview panel
	const handleWikiLinkClick = async (href: string, new_tab = false) => {
		// Support both #strata-note: and strata-note:// formats
		const raw = href.startsWith('#strata-note:') ? href.slice('#strata-note:'.length) : href.startsWith('strata-note://') ? href.slice('strata-note://'.length) : ''
		if (!raw) return false
		const [target] = raw.split('#')
		const raw_target = decodeURIComponent(target)
		// Resolve and open; heading anchors are not yet implemented

		// Resolve target on the renderer side using available notes
		const normalized = raw_target.trim().toLowerCase().replace(/\s+/g, ' ')
		const resolved = notes.find((candidate) => {
			const title = deriveNoteTitle(candidate.content)
			return title.trim().toLowerCase().replace(/\s+/g, ' ') === normalized
		})

		if (resolved) {
			await onOpenNoteFromChat(resolved.id, new_tab)
		} else {
			const create = window.confirm(`Note "${raw_target}" does not exist. Create it?`)
			if (create) {
				try {
					const newNote = await window.strata.notes.create()
					await window.strata.notes.update(newNote.id, { content: `# ${raw_target}\n\n` })
					await onOpenNoteFromChat(newNote.id, new_tab)
				} catch {
					// Silently fail — note creation may not be available
				}
			}
		}
		return true
	}

	// Preview content with wiki links converted
	const previewContent = wikiLinkToMarkdown(content)

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
							setTitleDraft(currentTitle)
							setEditingTitle(true)
						}}
						title="Click to edit title"
					>
						{currentTitle}
					</h2>
				)}
				<div className="editor-actions">
					{toolbar_status && <span className="save-status">{toolbar_status}</span>}
					<button className="icon-button" onClick={async () => {
						try {
							await copyRichTextToClipboard(content)
							setCopyToast(true)
							window.setTimeout(() => setCopyToast(false), 1800)
						} catch { /* silent */ }
					}} title="Copy Rich Text"><CopyIcon /></button>
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
				{copyToast && <span className="copy-toast">Copied!</span>}
			</header>
			<div className="editor-body" ref={editorBodyRef} style={{ gridTemplateColumns: showSidePanel ? (null === previewWidth ? 'minmax(0, 1fr) 6px minmax(0, 1fr)' : `minmax(0, 1fr) 6px minmax(280px, ${previewWidth}px)`) : 'minmax(0, 1fr)' }}
				onClick={(event) => {
					// Handle wiki link clicks in the CodeMirror editor
					const view = editorViewRef.current
					if (!view) return
					const target = event.target as HTMLElement
					// Only handle clicks on the CodeMirror content area, not on buttons etc
					if (!target.closest('.cm-editor')) return
					const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
					if (null === pos) return
					// Check if the clicked position is inside [[...]]
					const line = view.state.doc.lineAt(pos)
					const line_text = line.text
					const col = pos - line.from
					// Find [[...]] surrounding the click position
					const wiki_re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
					let match: RegExpExecArray | null
					while ((match = wiki_re.exec(line_text)) !== null) {
						if (col >= match.index && col <= match.index + match[0].length) {
							const raw_target = (match[1] ?? '').trim()
							if (!raw_target) return
							// User clicked a wiki link in the editor
							void handleWikiLinkClick(`#strata-note:${encodeURIComponent(raw_target)}`, event.metaKey || event.ctrlKey)
							return
						}
					}
				}}>
				<div className={`editor-input ${showSidePanel ? 'editor-input-split' : ''}`}>
					<CodeMirror
						value={editorContent}
						height="100%"
						extensions={[markdown(), EditorView.lineWrapping, richTextPasteExtension, h1AutoStripExtension, autocompletion({ override: [wikiLinkCompletions] })]}
						onCreateEditor={(view) => {
							editorViewRef.current = view
						}}
						theme={isLightTheme ? 'light' : oneDark}
						basicSetup={{
							lineNumbers: false,
							foldGutter: false,
						}}
						onChange={(value) => {
							const full = fullContentWithTitle(value, currentTitle)
							onChangeDraft(note.id, full)
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
								<ReactMarkdown
									remarkPlugins={[remarkGfm]}
									components={{
										a: ({ href, children, ...props }) => {
											const is_wiki = href && (href.startsWith('#strata-note:') || href.startsWith('strata-note://'))
											if (is_wiki) {
												return (
													<a
														href={href}
														className="wiki-link"
														onClick={(event) => {
															event.preventDefault()
															void handleWikiLinkClick(href, event.metaKey || event.ctrlKey)
														}}
														{...props}
													>
														{children}
													</a>
												)
											}
											return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
										},
										code: ({ className, children, ...props }) => {
											const match = /language-(\w+)/.exec(className || '')
											const lang = match ? match[1] : null
											if (lang) {
												return (
													<div className="code-block-wrapper">
														<span className="code-block-lang">{lang}</span>
														<code className={className} {...props}>{children}</code>
													</div>
												)
											}
											return <code className={className} {...props}>{children}</code>
										},
										blockquote: ({ children, ...props }) => {
											// Detect GitHub-style callouts: check if any text starts with [!TYPE]
											const extractAllText = (node: unknown): string => {
												if (typeof node === 'string') return node
												if (typeof node === 'number') return String(node)
												if (Array.isArray(node)) return node.map(extractAllText).join('')
												if (node && typeof node === 'object' && 'props' in node)
													return extractAllText((node as { props: Record<string, unknown> }).props.children)
												return ''
											}
											const full_text = extractAllText(children)
											const callout_match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.exec(full_text.trim())

											if (callout_match) {
												const type = callout_match[1].toUpperCase()
												const marker_re = /^\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i
												let stripped = false

												// Recursively strip [!TYPE] from the first text-bearing node
												const stripMarker = (node: React.ReactNode): React.ReactNode => {
													if (stripped) return node
													if (typeof node === 'string') {
														const replaced = node.replace(marker_re, '')
														if (replaced !== node) stripped = true
														return replaced.trim() ? replaced : null
													}
													if (Array.isArray(node)) {
														return (node as React.ReactNode[])
															.map(stripMarker)
															.filter((c): c is NonNullable<typeof c> => c !== null)
													}
													if (node && typeof node === 'object' && 'props' in node) {
														const el = node as React.ReactElement & { props: { children?: React.ReactNode } }
														if (el.props.children !== undefined) {
															const new_children = stripMarker(el.props.children)
															if (new_children !== el.props.children) {
																return { ...el, props: { ...el.props, children: new_children } } as React.ReactNode
															}
														}
													}
													return node
												}

												const body = Children.map(children, (child) => stripMarker(child))?.filter((c): c is NonNullable<typeof c> => c !== null)

												return (
													<div className={`callout callout-${type.toLowerCase()}`}>
														<span className="callout-label">{type}</span>
														<div className="callout-body">{body}</div>
													</div>
												)
											}
											return <blockquote {...props}>{children}</blockquote>
										},
									}}
								>
									{previewContent}
								</ReactMarkdown>
								{backlinks.length > 0 && (
									<div className="backlinks-section">
										<button
											className="backlinks-toggle"
											onClick={() => setShowBacklinks((v) => !v)}
										>
											{showBacklinks ? '▾' : '▸'} {backlinks.length} Backlink{backlinks.length !== 1 ? 's' : ''}
										</button>
										{showBacklinks && (
											<ul className="backlinks-list">
												{backlinks.map((entry) => (
													<li key={entry.link.id} className="backlink-item">
														<button
															className="backlink-title"
															onClick={(event) => void onOpenNoteFromChat(entry.source.id, event.metaKey || event.ctrlKey)}
														>
															{deriveNoteTitle(entry.source.content)}
														</button>
														<span className="backlink-label">{entry.link.label ?? entry.link.rawTarget}</span>
													</li>
												))}
											</ul>
										)}
									</div>
								)}
								{relatedNotes.length > 0 && (
									<div className="related-section">
										<button
											className="backlinks-toggle"
											onClick={() => setShowRelatedPreview((v) => !v)}
										>
											{showRelatedPreview ? '▾' : '▸'} {relatedNotes.length} Related Note{relatedNotes.length !== 1 ? 's' : ''}
										</button>
										{showRelatedPreview && (
											<ul className="backlinks-list">
												{relatedNotes.map((entry) => (
													<li key={entry.note.id} className="backlink-item">
														<button
															className="backlink-title"
															onClick={(event) => void onOpenNoteFromChat(entry.note.id, event.metaKey || event.ctrlKey)}
														>
															{deriveNoteTitle(entry.note.content)}
														</button>
														<span className="backlink-label">{entry.reason}</span>
													</li>
												))}
											</ul>
										)}
									</div>
								)}
							</article>
						)}
					</>
				)}
			</div>
			{showInlineFind && (
				<div className="inline-find-bar">
					<input
						className="inline-find-input"
						type="text"
						value={inlineFindQuery}
						onChange={(event) => setInlineFindQuery(event.target.value)}
						onKeyDown={(event) => {
							if ('Enter' === event.key) {
								event.shiftKey ? handleInlineFindPrev() : handleInlineFindNext()
							}
							if ('Escape' === event.key) {
								setShowInlineFind(false)
								setInlineFindQuery('')
							}
						}}
						placeholder="Find..."
						autoFocus
					/>
					<span className="inline-find-count">
						{inlineFindQuery ? `${inlineFindIndex + 1} / ${inlineFindCount}` : '0 / 0'}
					</span>
					<button className="icon-button" onClick={handleInlineFindPrev} title="Previous match" aria-label="Previous match">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l14 0" /><path d="M5 12l4 4" /><path d="M5 12l4 -4" /></svg>
					</button>
					<button className="icon-button" onClick={handleInlineFindNext} title="Next match" aria-label="Next match">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12l-14 0" /><path d="M19 12l-4 4" /><path d="M19 12l-4 -4" /></svg>
					</button>
					<button className="icon-button" onClick={() => { setShowInlineFind(false); setInlineFindQuery('') }} title="Close find" aria-label="Close find">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
					</button>
				</div>
			)}
			<footer className="editor-footer">
				<span>{countWords(content)} words</span>
				<div className="editor-footer-actions">
					<button className={`icon-button ${showFindReplace ? 'chip-active' : ''}`} onClick={() => {
						setFindReplaceStatus('')
						setShowFindReplace(true)
					}} title="Find and Replace"><FileSearchIcon /></button>
					<button className="icon-button" onClick={() => setShowPublish(true)} title="Export / Publish Note"><UploadIcon /></button>
					<button className="icon-button" onClick={onShowRelatedNotes} title="Related Notes"><CirclesRelationIcon /></button>
					<button className="icon-button" onClick={() => void printNote()} title="Print Note"><PrinterIcon /></button>
					<button className="icon-button" onClick={() => onToggleArchive(note.id)} title="Toggle Archive"><ArchiveIcon /></button>
					<button className="icon-button" onClick={() => onDelete(note.id)} title="Delete Note"><TrashIcon /></button>
					<button className="icon-button" onClick={async () => {
						if (!note) return
						try {
							const edits = await window.strata.ai.listEdits(note.id)
							setAiEdits(edits)
							setShowAiHistory(true)
						} catch { setAiEdits([]); setShowAiHistory(true) }
					}} title="AI Edit History"><FileTextAiIcon /></button>
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
			<PublishModal
				open={showPublish}
				noteTitle={deriveNoteTitle(content)}
				noteContent={content}
				onClose={() => setShowPublish(false)}
			/>
			{showAiHistory && (
				<div className="modal-overlay" onClick={() => setShowAiHistory(false)}>
					<div className="modal-card related-notes-modal" onClick={(event) => event.stopPropagation()}>
						<h3 className="related-notes-heading">AI Edit History</h3>
						<button className="icon-button modal-close-button" onClick={() => setShowAiHistory(false)} aria-label="Close"><CloseIcon /></button>
						<div className="related-notes-body">
							{aiEdits.length === 0 && <p className="related-notes-empty">No AI edits recorded for this note.</p>}
							{aiEdits.map((edit) => (
								<div key={edit.id} className="related-note-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
										<span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase' }}>{edit.action} • {new Date(edit.createdAt).toLocaleString()}</span>
										{!edit.revertedAt && (
											<button className="ghost-button" style={{ fontSize: 10, padding: '2px 8px' }} onClick={async () => {
												const ok = await window.strata.ai.revertEdit(edit.id)
												if (ok) {
													setAiEdits((prev) => prev.map((e) => e.id === edit.id ? { ...e, revertedAt: new Date().toISOString() } : e))
												}
											}}>Revert</button>
										)}
										{edit.revertedAt && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Reverted</span>}
									</div>
									{edit.beforeContent !== null && edit.afterContent !== null && (
										<div style={{ fontSize: 11, color: 'var(--text-3)' }}>
											{edit.beforeContent !== edit.afterContent ? 'Content changed.' : 'Content unchanged.'}
										</div>
									)}
									{edit.promptExcerpt && <div style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Prompt: {edit.promptExcerpt}</div>}
								</div>
							))}
						</div>
					</div>
				</div>
			)}
		</section>
	)
}
