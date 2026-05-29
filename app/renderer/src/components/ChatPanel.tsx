import { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AiMessage, AiSearchResult, AiThreadSummary } from '@shared/types'
import { aiService } from '@renderer/src/services/aiService'
import { ChartCandleIcon, CloseIcon, CopyIcon, ListDetailsIcon, MessageOffIcon, MessagePlusIcon, MicrophoneIcon, SendIcon } from './icons'

interface ChatUsageSummary {
	inputTokens: number
	outputTokens: number
	totalTokens: number
	impliedCostUsd: number | null
	providers: Array<{
		providerId: string
		model: string
		inputTokens: number
		outputTokens: number
		impliedCostUsd: number | null
		requests: number
	}>
}

interface DictationResult {
	readonly 0: { transcript: string }
	readonly length: number
}

interface DictationEvent {
	readonly resultIndex: number
	readonly results: {
		readonly length: number
		[index: number]: DictationResult
	}
}

interface DictationRecognition {
	continuous: boolean
	interimResults: boolean
	lang: string
	onresult: ((event: DictationEvent) => void) | null
	onerror: (() => void) | null
	onend: (() => void) | null
	start: () => void
	stop: () => void
}

type DictationConstructor = new () => DictationRecognition

interface NoteLinkOption {
	id: string
	title: string
}

interface ModelCatalogEntry {
	providerId: string
	providerLabel: string
	model: string
}

interface WikiDraftContext {
	from: number
	to: number
	query: string
}

const blob_to_base64 = async (blob: Blob): Promise<string> => {
	return await new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onerror = () => reject(new Error('Failed to read recorded audio'))
		reader.onloadend = () => {
			const result = 'string' === typeof reader.result ? reader.result : ''
			const base64 = result.includes(',') ? result.split(',')[1] : ''
			if (!base64) {
				reject(new Error('Recorded audio could not be encoded'))
				return
			}
			resolve(base64)
		}
		reader.readAsDataURL(blob)
	})
}

const encode_wav = (samples: Float32Array, sample_rate: number): Blob => {
	const bytes_per_sample = 2
	const block_align = bytes_per_sample
	const byte_rate = sample_rate * block_align
	const data_size = samples.length * bytes_per_sample
	const buffer = new ArrayBuffer(44 + data_size)
	const view = new DataView(buffer)

	let offset = 0
	const write_string = (value: string) => {
		for (let index = 0; index < value.length; index += 1) {
			view.setUint8(offset + index, value.charCodeAt(index))
		}
		offset += value.length
	}

	write_string('RIFF')
	view.setUint32(offset, 36 + data_size, true)
	offset += 4
	write_string('WAVE')
	write_string('fmt ')
	view.setUint32(offset, 16, true)
	offset += 4
	view.setUint16(offset, 1, true)
	offset += 2
	view.setUint16(offset, 1, true)
	offset += 2
	view.setUint32(offset, sample_rate, true)
	offset += 4
	view.setUint32(offset, byte_rate, true)
	offset += 4
	view.setUint16(offset, block_align, true)
	offset += 2
	view.setUint16(offset, 16, true)
	offset += 2
	write_string('data')
	view.setUint32(offset, data_size, true)
	offset += 4

	for (let index = 0; index < samples.length; index += 1) {
		const sample = Math.max(-1, Math.min(1, samples[index]))
		view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
		offset += 2
	}

	return new Blob([buffer], { type: 'audio/wav' })
}

interface ChatPanelProps {
	threads: AiThreadSummary[]
	activeThreadId: string | null
	messages: AiMessage[]
	modelName: string
	threadModel: string
	modelCatalog: ModelCatalogEntry[]
	noteTitlesById: Record<string, string>
	noteLinkOptions: NoteLinkOption[]
	searchQuery: string
	searchResults: AiSearchResult[]
	loadingThreads: boolean
	loadingMessages: boolean
	sending: boolean
	assistantTyping: boolean
	deleting: boolean
	errorMessage: string
	chatUsageSummary: ChatUsageSummary | null
	chatUsageLoading: boolean
	onSelectThread: (thread_id: string) => void
	onCreateThread: () => void
	onDeleteThread: () => Promise<void>
	onRenameThread: (thread_id: string, title: string) => Promise<void>
	onSearchQueryChange: (value: string) => void
	onRunSearch: (query?: string) => void
	onClearSearch: () => void
	onSendMessage: (message: string) => Promise<void>
	onOpenNote: (note_id: string, new_tab?: boolean) => void
	onSetThreadModel: (model: string) => void
}

const note_id_pattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

const normalize_note_id = (value: string): string => value.toLowerCase()

const escape_markdown_label = (value: string): string => value.replace(/[()[\]\\]/g, '\\$&')

const format_assistant_content = (value: string, note_titles_by_id: Record<string, string>): string => {
	const relevant_note_ids_pattern = /Relevant note IDs:\s*([^\n]+)/i
	const match = value.match(relevant_note_ids_pattern)
	let formatted = value

	if (match && match[1]) {
		const note_ids = Array.from(new Set((match[1].match(note_id_pattern) ?? []).map(normalize_note_id)))
		if (note_ids.length > 0) {
			const note_links = note_ids
				.map((note_id) => {
					const label = note_titles_by_id[note_id] ? escape_markdown_label(note_titles_by_id[note_id]) : note_id
					return `- [${label}](#strata-note:${note_id})`
				})
				.join('\n')

			formatted = formatted.replace(relevant_note_ids_pattern, `Relevant notes:\n${note_links}`)
		}
	}

	return formatted.replace(note_id_pattern, (raw_note_id, offset, source) => {
		const normalized_note_id = normalize_note_id(raw_note_id)
		const note_title = note_titles_by_id[normalized_note_id]
		if (!note_title) return raw_note_id

		const prefix = source.slice(Math.max(0, offset - 17), offset).toLowerCase()
		if (prefix.includes('strata-note:')) return raw_note_id

		return `[${escape_markdown_label(note_title)}](#strata-note:${normalized_note_id})`
	})
}

const format_time = (value: string): string => {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return ''
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const trim_message_preview = (value: string): string => {
	const normalized = value.replace(/\s+/g, ' ').trim()
	if (normalized.length <= 88) return normalized
	return `${normalized.slice(0, 85)}...`
}

const get_wiki_draft_context = (value: string, cursor: number): WikiDraftContext | null => {
	if (cursor < 0 || cursor > value.length) return null
	const text_before_cursor = value.slice(0, cursor)
	const open_bracket_index = text_before_cursor.lastIndexOf('[[')
	if (-1 === open_bracket_index) return null

	const fragment = text_before_cursor.slice(open_bracket_index + 2)
	if (fragment.includes(']]')) return null
	if (/\n|\r/.test(fragment)) return null

	return {
		from: open_bracket_index,
		to: cursor,
		query: fragment.trim().toLowerCase(),
	}
}

const format_token_count = (value: number): string => value.toLocaleString()

const format_implied_cost = (value: number | null): string => {
	if (null === value) return 'n/a'
	if (value < 0.0001) return '<$0.0001'
	if (value < 0.01) return `$${value.toFixed(4)}`
	return `$${value.toFixed(2)}`
}

export function ChatPanel(props: ChatPanelProps) {
	const {
		threads,
		activeThreadId,
		messages,
		modelName,
		threadModel,
		modelCatalog,
		noteTitlesById,
		noteLinkOptions,
		searchQuery,
		searchResults,
		loadingThreads,
		loadingMessages,
		sending,
		assistantTyping,
		deleting,
		errorMessage,
		chatUsageSummary,
		chatUsageLoading,
		onSelectThread,
		onCreateThread,
		onDeleteThread,
		onRenameThread,
		onSearchQueryChange,
		onRunSearch,
		onClearSearch,
		onSendMessage,
		onOpenNote,
		onSetThreadModel,
	} = props
	const assistant_label = `Strata AI - ${modelName || 'gpt-4o'}`
	const [draft, setDraft] = useState('')
	const [showSearchModal, setShowSearchModal] = useState(false)
	const [showUsageModal, setShowUsageModal] = useState(false)
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
	const [thinkingDots, setThinkingDots] = useState('.')
	const [isDictating, setIsDictating] = useState(false)
	const [isTranscribing, setIsTranscribing] = useState(false)
	const [dictationError, setDictationError] = useState('')
	const [liveDictationText, setLiveDictationText] = useState('')
	const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
	const [titleDraft, setTitleDraft] = useState('')
	const [editingThreadTitle, setEditingThreadTitle] = useState(false)
	const [renamingTitle, setRenamingTitle] = useState(false)
	const [copiedCodeBlockId, setCopiedCodeBlockId] = useState<string | null>(null)
	const [copyToastText, setCopyToastText] = useState<string | null>(null)
	const [composeCursor, setComposeCursor] = useState(0)
	const [activeWikiSuggestionIndex, setActiveWikiSuggestionIndex] = useState(0)
	const [hideWikiSuggestions, setHideWikiSuggestions] = useState(false)
	const [modelMenuOpen, setModelMenuOpen] = useState(false)
	const [modelSearch, setModelSearch] = useState('')
	const [modelMenuActiveIndex, setModelMenuActiveIndex] = useState(0)
	const [optimisticModel, setOptimisticModel] = useState<string | null>(null)
	const modelMenuRef = useRef<HTMLDivElement | null>(null)
	const modelSearchInputRef = useRef<HTMLInputElement | null>(null)
	const liveDictationTextRef = useRef('')
	const chatMessagesRef = useRef<HTMLDivElement | null>(null)
	const chatSearchInputRef = useRef<HTMLInputElement | null>(null)
	const composeTextareaRef = useRef<HTMLTextAreaElement | null>(null)
	const copiedTimerRef = useRef<number | null>(null)
	const copiedCodeTimerRef = useRef<number | null>(null)
	const copyToastTimerRef = useRef<number | null>(null)
	const mediaStreamRef = useRef<MediaStream | null>(null)
	const liveTranscriptRef = useRef('')
	const baseDraftBeforeDictationRef = useRef('')
	const liveDictationRef = useRef<DictationRecognition | null>(null)
	const audioContextRef = useRef<AudioContext | null>(null)
	const audioSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
	const audioProcessorNodeRef = useRef<ScriptProcessorNode | null>(null)
	const silentGainNodeRef = useRef<GainNode | null>(null)
	const pcmChunksRef = useRef<Float32Array[]>([])
	const pcmSamplesCountRef = useRef(0)
	const pcmSampleRateRef = useRef(16000)

	const speech_constructor = useMemo(() => {
		const speech_window = window as Window & {
			SpeechRecognition?: DictationConstructor
			webkitSpeechRecognition?: DictationConstructor
		}

		return speech_window.SpeechRecognition ?? speech_window.webkitSpeechRecognition ?? null
	}, [])

	const active_thread = useMemo(
		() => threads.find((entry) => entry.thread.id === activeThreadId) ?? null,
		[activeThreadId, threads],
	)
	const filtered_models = useMemo(() => {
		const query = modelSearch.trim().toLowerCase()
		if (!query) return modelCatalog
		return modelCatalog.filter((entry) =>
			entry.model.toLowerCase().includes(query) ||
			entry.providerLabel.toLowerCase().includes(query)
		)
	}, [modelCatalog, modelSearch])
	const display_model_label = useMemo(() => {
		if (null === optimisticModel) return threadModel || 'Auto'
		if (!optimisticModel) return 'Auto'
		const match = modelCatalog.find((entry) => entry.model === optimisticModel)
		return match ? `${match.providerLabel} — ${match.model}` : optimisticModel
	}, [modelCatalog, optimisticModel, threadModel])
	const wiki_draft_context = useMemo(() => get_wiki_draft_context(draft, composeCursor), [composeCursor, draft])
	const wiki_suggestions = useMemo(() => {
		if (hideWikiSuggestions || !wiki_draft_context) return []

		const query = wiki_draft_context.query
		const suggestions = noteLinkOptions
			.filter((option) => {
				if (!query) return true
				return option.title.toLowerCase().includes(query)
			})
			.slice(0, 8)

		return suggestions
	}, [hideWikiSuggestions, noteLinkOptions, wiki_draft_context])
	const chat_search_results = useMemo(() => {
		const sorted_threads = [...threads].sort((a, b) => {
			const a_time = Date.parse(a.thread.updatedAt)
			const b_time = Date.parse(b.thread.updatedAt)
			if (Number.isNaN(a_time) || Number.isNaN(b_time)) return 0
			return b_time - a_time
		})

		const query = searchQuery.trim().toLowerCase()
		if (!query) {
			return sorted_threads.map((entry) => ({
			threadId: entry.thread.id,
			title: entry.thread.title,
			preview: trim_message_preview(entry.lastMessage?.content ?? 'No messages yet.'),
		}))
		}

		const by_title = sorted_threads
			.filter((entry) => entry.thread.title.toLowerCase().includes(query))
			.map((entry) => ({
				threadId: entry.thread.id,
				title: entry.thread.title,
				preview: trim_message_preview(entry.lastMessage?.content ?? 'No messages yet.'),
			}))

		if (by_title.length > 0) return by_title

		const fallback = new Map<string, { threadId: string; title: string; preview: string }>()
		for (const result of searchResults) {
			if (fallback.has(result.thread.id)) continue
			fallback.set(result.thread.id, {
				threadId: result.thread.id,
				title: result.thread.title,
				preview: trim_message_preview(result.message.content),
			})
		}

		return [...fallback.values()]
	}, [searchQuery, searchResults, threads])

	const resize_compose_textarea = useCallback(() => {
		const textarea = composeTextareaRef.current
		if (!textarea) return

		const computed = window.getComputedStyle(textarea)
		const line_height = Number.parseFloat(computed.lineHeight) || 20
		const vertical_padding = (Number.parseFloat(computed.paddingTop) || 0) + (Number.parseFloat(computed.paddingBottom) || 0)
		const vertical_border = (Number.parseFloat(computed.borderTopWidth) || 0) + (Number.parseFloat(computed.borderBottomWidth) || 0)
		const min_height = Math.ceil((line_height * 3) + vertical_padding + vertical_border)
		const max_height = Math.ceil((line_height * 12) + vertical_padding + vertical_border)

		textarea.style.height = 'auto'
		const next_height = Math.min(max_height, Math.max(min_height, textarea.scrollHeight))
		textarea.style.height = `${next_height}px`
		textarea.style.overflowY = textarea.scrollHeight > max_height ? 'auto' : 'hidden'
	}, [])

	const apply_wiki_suggestion = useCallback((note_title: string) => {
		const textarea = composeTextareaRef.current
		if (!textarea) return

		const selection_start = textarea.selectionStart ?? composeCursor
		const context = get_wiki_draft_context(draft, selection_start)
		if (!context) return

		const replacement = `[[${note_title}]]`
		const next_draft = `${draft.slice(0, context.from)}${replacement}${draft.slice(context.to)}`
		const next_cursor = context.from + replacement.length

		setDraft(next_draft)
		setComposeCursor(next_cursor)
		setHideWikiSuggestions(false)
		window.setTimeout(() => {
			textarea.focus()
			textarea.setSelectionRange(next_cursor, next_cursor)
		}, 0)
	}, [composeCursor, draft])

	const show_copy_toast = useCallback((text: string) => {
		setCopyToastText(text)
		if (copyToastTimerRef.current) window.clearTimeout(copyToastTimerRef.current)
		copyToastTimerRef.current = window.setTimeout(() => {
			setCopyToastText(null)
		}, 1800)
	}, [])

	const copy_message_text = useCallback(async (message_id: string, message_content: string) => {
		try {
			await navigator.clipboard.writeText(message_content)
			setCopiedMessageId(message_id)
			show_copy_toast('Message copied')
			if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current)
			copiedTimerRef.current = window.setTimeout(() => {
				setCopiedMessageId((current) => (current === message_id ? null : current))
			}, 1600)
		} catch {
			setCopiedMessageId(null)
		}
	}, [show_copy_toast])

	const copy_code_block = useCallback(async (code_block_id: string, code_content: string) => {
		try {
			await navigator.clipboard.writeText(code_content)
			setCopiedCodeBlockId(code_block_id)
			show_copy_toast('Code copied')
			if (copiedCodeTimerRef.current) window.clearTimeout(copiedCodeTimerRef.current)
			copiedCodeTimerRef.current = window.setTimeout(() => {
				setCopiedCodeBlockId((current) => (current === code_block_id ? null : current))
			}, 1600)
		} catch {
			setCopiedCodeBlockId(null)
		}
	}, [show_copy_toast])

	const commit_thread_title = useCallback(async () => {
		if (!active_thread || renamingTitle) {
			setEditingThreadTitle(false)
			return
		}

		const next_title = titleDraft.trim()
		if (!next_title) {
			setTitleDraft(active_thread.thread.title)
			setEditingThreadTitle(false)
			return
		}

		if (next_title === active_thread.thread.title) {
			setEditingThreadTitle(false)
			return
		}

		setRenamingTitle(true)
		try {
			await onRenameThread(active_thread.thread.id, next_title)
			setEditingThreadTitle(false)
		} finally {
			setRenamingTitle(false)
		}
	}, [active_thread, onRenameThread, renamingTitle, titleDraft])

	useEffect(() => {
		if (!sending && !assistantTyping) {
			setThinkingDots('.')
			return
		}

		const interval_id = window.setInterval(() => {
			setThinkingDots((value) => {
				if ('.' === value) return '..'
				if ('..' === value) return '...'
				return '.'
			})
		}, 420)

		return () => window.clearInterval(interval_id)
	}, [assistantTyping, sending])

	useEffect(() => {
		if (!showSearchModal) return
		window.setTimeout(() => {
			chatSearchInputRef.current?.focus()
			chatSearchInputRef.current?.select()
		}, 0)
	}, [showSearchModal])

	useEffect(() => {
		if (modelMenuOpen) {
			setModelMenuActiveIndex(0)
			window.setTimeout(() => modelSearchInputRef.current?.focus(), 0)
		} else {
			setModelSearch('')
		}
	}, [modelMenuOpen])

	// Sync optimistic model when threadModel prop updates from external changes
	useEffect(() => {
		if (threadModel) setOptimisticModel(threadModel)
	}, [threadModel])

	useEffect(() => {
		if (!modelMenuOpen) return
		const onMouseDown = (event: MouseEvent) => {
			if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
				setModelMenuOpen(false)
			}
		}
		document.addEventListener('mousedown', onMouseDown)
		return () => document.removeEventListener('mousedown', onMouseDown)
	}, [modelMenuOpen])

	useEffect(() => {
		if (!active_thread) {
			setTitleDraft('')
			setEditingThreadTitle(false)
			return
		}
		setTitleDraft(active_thread.thread.title)
	}, [active_thread])

	useEffect(() => {
		resize_compose_textarea()
	}, [draft, resize_compose_textarea])

	useEffect(() => {
		setHideWikiSuggestions(false)
	}, [composeCursor, draft])

	useEffect(() => {
		if (0 === wiki_suggestions.length) {
			setActiveWikiSuggestionIndex(0)
			return
		}
		setActiveWikiSuggestionIndex((current) => Math.min(current, wiki_suggestions.length - 1))
	}, [wiki_suggestions])

	useEffect(() => {
		if (!chatMessagesRef.current) return
		chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
	}, [messages, sending, assistantTyping])

	useEffect(() => {
		liveDictationTextRef.current = liveDictationText
	}, [liveDictationText])

	useEffect(() => {
		return () => {
			if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current)
			if (copiedCodeTimerRef.current) window.clearTimeout(copiedCodeTimerRef.current)
			if (copyToastTimerRef.current) window.clearTimeout(copyToastTimerRef.current)
			liveDictationRef.current?.stop()
			audioProcessorNodeRef.current?.disconnect()
			audioSourceNodeRef.current?.disconnect()
			silentGainNodeRef.current?.disconnect()
			void audioContextRef.current?.close()
			audioProcessorNodeRef.current = null
			audioSourceNodeRef.current = null
			silentGainNodeRef.current = null
			audioContextRef.current = null
			if (mediaStreamRef.current) {
				mediaStreamRef.current.getTracks().forEach((track) => track.stop())
				mediaStreamRef.current = null
			}
			liveTranscriptRef.current = ''
			pcmChunksRef.current = []
			pcmSamplesCountRef.current = 0
		}
	}, [])

	const updateLivePreview = (next_live_transcript: string) => {
		const base = baseDraftBeforeDictationRef.current.trimEnd()
		const normalized = next_live_transcript.trim()
		liveDictationTextRef.current = normalized
		setLiveDictationText(normalized)
		if (!normalized) {
			setDraft(base)
			return
		}
		setDraft(base ? `${base} ${normalized}` : normalized)
	}

	const toggleDictation = async () => {
		if (sending || assistantTyping) return

		if (isDictating) {
			liveDictationRef.current?.stop()
			setIsDictating(false)

			const base = baseDraftBeforeDictationRef.current.trimEnd()
			const live_text = liveDictationTextRef.current.trim()
			if (live_text) {
				setDraft(base ? `${base} ${live_text}` : live_text)
			}

			audioProcessorNodeRef.current?.disconnect()
			audioSourceNodeRef.current?.disconnect()
			silentGainNodeRef.current?.disconnect()
			audioProcessorNodeRef.current = null
			audioSourceNodeRef.current = null
			silentGainNodeRef.current = null

			if (mediaStreamRef.current) {
				mediaStreamRef.current.getTracks().forEach((track) => track.stop())
				mediaStreamRef.current = null
			}

			void audioContextRef.current?.close()
			audioContextRef.current = null

			if (0 === pcmSamplesCountRef.current) {
				if (!live_text) setDictationError('No speech detected. Please check microphone input and try again.')
				return
			}

			const merged = new Float32Array(pcmSamplesCountRef.current)
			let position = 0
			for (const chunk of pcmChunksRef.current) {
				merged.set(chunk, position)
				position += chunk.length
			}
			pcmChunksRef.current = []
			pcmSamplesCountRef.current = 0

			const wav_blob = encode_wav(merged, pcmSampleRateRef.current)
			setIsTranscribing(true)
			void blob_to_base64(wav_blob)
				.then(async (buffer) => {
					const result = await aiService.transcribeAudio({
						base64Audio: buffer,
						mimeType: 'audio/wav',
						language: 'en',
						prompt: 'Final microphone transcription. Return complete spoken text only.',
					})
					const transcript = result.text.trim()
					const fallback_live = liveDictationTextRef.current.trim()
					const final_text = transcript || fallback_live
					if (!final_text) {
						setDictationError('No speech detected. Please check microphone input and try again.')
						return
					}
					setDraft(base ? `${base} ${final_text}` : final_text)
					liveTranscriptRef.current = final_text
					setLiveDictationText(final_text)
				})
				.catch((error) => {
					setDictationError(error instanceof Error ? error.message : 'Transcription failed')
				})
				.finally(() => {
					setIsTranscribing(false)
				})
			return
		}

		setDictationError('')
		if (!navigator.mediaDevices?.getUserMedia || 'undefined' === typeof AudioContext) {
			setDictationError('Microphone recording is not available in this environment')
			return
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
			mediaStreamRef.current = stream
			liveTranscriptRef.current = ''
			pcmChunksRef.current = []
			pcmSamplesCountRef.current = 0
			baseDraftBeforeDictationRef.current = draft
			setLiveDictationText('')
			updateLivePreview('')

			const audio_context = new AudioContext()
			audioContextRef.current = audio_context
			pcmSampleRateRef.current = audio_context.sampleRate

			const source = audio_context.createMediaStreamSource(stream)
			audioSourceNodeRef.current = source

			const processor = audio_context.createScriptProcessor(4096, 1, 1)
			audioProcessorNodeRef.current = processor

			const silent_gain = audio_context.createGain()
			silent_gain.gain.value = 0
			silentGainNodeRef.current = silent_gain

			processor.onaudioprocess = (event) => {
				const input = event.inputBuffer.getChannelData(0)
				const copy = new Float32Array(input.length)
				copy.set(input)
				pcmChunksRef.current.push(copy)
				pcmSamplesCountRef.current += copy.length
			}

			source.connect(processor)
			processor.connect(silent_gain)
			silent_gain.connect(audio_context.destination)

			if (speech_constructor) {
				try {
					const live_recognition = new speech_constructor()
					live_recognition.continuous = true
					live_recognition.interimResults = true
					live_recognition.lang = 'en-US'
					live_recognition.onresult = (event) => {
						let transcript = ''
						for (let index = 0; index < event.results.length; index += 1) {
							transcript += event.results[index][0].transcript
						}
						const preview = transcript.trim()
						if (preview) {
							liveTranscriptRef.current = preview
							updateLivePreview(preview)
						}
					}
					live_recognition.onerror = () => {
						liveDictationRef.current = null
					}
					live_recognition.onend = () => {
						liveDictationRef.current = null
					}
					liveDictationRef.current = live_recognition
					live_recognition.start()
				} catch {
					liveDictationRef.current = null
				}
			}

			setIsDictating(true)
		} catch (error) {
			setDictationError(error instanceof Error ? error.message : 'Unable to access microphone')
			setIsDictating(false)
			if (mediaStreamRef.current) {
				mediaStreamRef.current.getTracks().forEach((track) => track.stop())
				mediaStreamRef.current = null
			}
			audioProcessorNodeRef.current?.disconnect()
			audioSourceNodeRef.current?.disconnect()
			silentGainNodeRef.current?.disconnect()
			void audioContextRef.current?.close()
			audioProcessorNodeRef.current = null
			audioSourceNodeRef.current = null
			silentGainNodeRef.current = null
			audioContextRef.current = null
		}
	}

	return (
		<aside className="preview-panel chat-panel">
			<div className="chat-panel-top">
				<div className="chat-thread-row">
					{editingThreadTitle && active_thread ? (
						<input
							className="search-input chat-thread-title-input"
							value={titleDraft}
							onChange={(event) => setTitleDraft(event.target.value)}
							onBlur={() => {
								void commit_thread_title()
							}}
							onKeyDown={(event) => {
								if ('Enter' === event.key) {
									event.preventDefault()
									void commit_thread_title()
									return
								}
								if ('Escape' === event.key) {
									event.preventDefault()
									setTitleDraft(active_thread.thread.title)
									setEditingThreadTitle(false)
								}
							}}
							disabled={renamingTitle}
						/>
					) : (
						<button
							type="button"
							className="ghost-button chat-thread-title-button"
							onClick={() => {
								if (!active_thread) return
								setTitleDraft(active_thread.thread.title)
								setEditingThreadTitle(true)
							}}
							title={active_thread ? 'Rename chat title' : 'Current chat title'}
						>
							{active_thread ? active_thread.thread.title : 'New chat'}
						</button>
					)}
					<button className="icon-button" onClick={onCreateThread} title="New chat" aria-label="New chat"><MessagePlusIcon /></button>
					<button className="icon-button" onClick={() => setShowDeleteConfirm(true)} disabled={!activeThreadId || deleting} title="Delete chat" aria-label="Delete chat"><MessageOffIcon /></button>
					<button className={`icon-button ${showSearchModal ? 'chip-active' : ''}`} onClick={() => {
						onSearchQueryChange('')
						onClearSearch()
						setShowSearchModal(true)
					}} disabled={loadingThreads} title="Browse chats" aria-label="Browse chats"><ListDetailsIcon /></button>
					<button className={`icon-button ${showUsageModal ? 'chip-active' : ''}`} onClick={() => setShowUsageModal(true)} title="Usage details" aria-label="Usage details"><ChartCandleIcon /></button>
				</div>
			</div>

			<div className="chat-messages" aria-live="polite" ref={chatMessagesRef}>
				{loadingMessages ? (
					<p className="chat-placeholder">Loading messages…</p>
				) : (
					<>
						{messages.map((message) => (
							<div key={message.id} className={`chat-message-row chat-message-${message.role}`}>
								<div className={`chat-bubble chat-${message.role}`}>
									<div className="chat-bubble-meta">
										<span>{'user' === message.role ? 'You' : assistant_label}</span>
									</div>
									{'assistant' === message.role ? (
										<div className="chat-bubble-content">
											<ReactMarkdown
												remarkPlugins={[remarkGfm]}
												components={{
													a: ({ href, children }) => {
														const target = href ?? ''
														let note_id = ''
														if (target.startsWith('#strata-note:')) {
															note_id = normalize_note_id(target.replace('#strata-note:', '').trim())
														} else if (target.startsWith('strata-note://')) {
															note_id = normalize_note_id(target.replace('strata-note://', '').trim())
														}
														if (note_id) {
															return (
																<a
																	href="#"
																	onClick={(event) => {
																		event.preventDefault()
																		onOpenNote(note_id, event.metaKey || event.ctrlKey)
																	}}
																	className="chat-note-link"
																>
																	{children}
																</a>
															)
														}

														return <a href={target} target="_blank" rel="noreferrer">{children}</a>
													},
													code: ({ className, children }) => {
														return <code className={className}>{children}</code>
													},
													pre: ({ children }) => {
														const child = Array.isArray(children) ? children[0] : children
														if (!isValidElement(child)) {
															return <pre>{children}</pre>
														}

														const child_props = child.props as { className?: string; children?: unknown }
														const code_class_name = child_props.className
														const code_value = String(child_props.children ?? '').replace(/\n$/, '')
														const code_block_id = `${message.id}:${code_value.slice(0, 120)}`

														return (
															<div className="chat-codeblock">
																<button
																	type="button"
																	className="chat-codeblock-copy"
																	onClick={() => void copy_code_block(code_block_id, code_value)}
																	title={copiedCodeBlockId === code_block_id ? 'Copied' : 'Copy code'}
																	aria-label={copiedCodeBlockId === code_block_id ? 'Copied' : 'Copy code'}
																>
																	<CopyIcon size={14} />
																</button>
																<pre>
																	<code className={code_class_name}>{code_value}</code>
																</pre>
															</div>
														)
													},
												}}
											>
												{format_assistant_content(message.content, noteTitlesById)}
											</ReactMarkdown>
										</div>
									) : (
										<p>{message.content}</p>
									)}
								</div>
								<div className="chat-bubble-actions">
									<time>{format_time(message.createdAt)}</time>
									<button
										type="button"
										className="chat-copy-button"
										onClick={() => void copy_message_text(message.id, message.content)}
										title={copiedMessageId === message.id ? 'Copied' : 'Copy message'}
										aria-label={copiedMessageId === message.id ? 'Copied' : 'Copy message'}
									>
										<CopyIcon size={16} />
									</button>
								</div>
							</div>
						))}
						{sending && (
							<div className="chat-bubble chat-assistant chat-thinking" aria-live="polite">
								<div className="chat-bubble-meta">
									<span>{assistant_label}</span>
								</div>
								<p>{`Thinking${thinkingDots}`}</p>
							</div>
						)}
						{assistantTyping && !sending && (
							<div className="chat-bubble chat-assistant chat-thinking" aria-live="polite">
								<div className="chat-bubble-meta">
									<span>{assistant_label}</span>
								</div>
								<p>{`Typing${thinkingDots}`}</p>
							</div>
						)}
					</>
				)}
			</div>

			{(errorMessage || dictationError || isTranscribing || isDictating) && <p className="chat-error">{errorMessage || dictationError || (isTranscribing ? 'Transcribing audio…' : 'Listening…')}</p>}
			{isDictating && liveDictationText && <p className="chat-placeholder">{liveDictationText}</p>}

			<form
				className="chat-compose"
				onSubmit={(event) => {
					event.preventDefault()
					const next = draft.trim()
					if (!next || sending || isDictating || isTranscribing) return
					void onSendMessage(next)
					setDraft('')
				}}
			>
				<textarea
					ref={composeTextareaRef}
					value={draft}
					onChange={(event) => {
						setDraft(event.target.value)
						setComposeCursor(event.target.selectionStart ?? event.target.value.length)
					}}
					onClick={(event) => {
						setComposeCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length)
					}}
					onSelect={(event) => {
						setComposeCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length)
					}}
					onKeyDown={(event) => {
						if (wiki_suggestions.length > 0) {
							if ('ArrowDown' === event.key) {
								event.preventDefault()
								setActiveWikiSuggestionIndex((current) => (current + 1) % wiki_suggestions.length)
								return
							}
							if ('ArrowUp' === event.key) {
								event.preventDefault()
								setActiveWikiSuggestionIndex((current) => (current - 1 + wiki_suggestions.length) % wiki_suggestions.length)
								return
							}
							if ('Escape' === event.key) {
								event.preventDefault()
								setHideWikiSuggestions(true)
								return
							}
							if ('Tab' === event.key || ('Enter' === event.key && !event.shiftKey)) {
								event.preventDefault()
								const option = wiki_suggestions[activeWikiSuggestionIndex]
								if (option) apply_wiki_suggestion(option.title)
								return
							}
						}

						if ('Enter' !== event.key || event.shiftKey) return
						event.preventDefault()
						const next = draft.trim()
						if (!next || sending || assistantTyping || isDictating || isTranscribing) return
						void onSendMessage(next)
						setDraft('')
						setComposeCursor(0)
					}}
					placeholder="Message Strata AI…"
					rows={3}
					disabled={sending || assistantTyping}
				/>
				{wiki_suggestions.length > 0 && (
					<div className="chat-compose-wikilinks" role="listbox" aria-label="Wiki link suggestions">
						{wiki_suggestions.map((option, index) => (
							<button
								key={`${option.id}:${option.title}`}
								type="button"
								className={`chat-compose-wikilink-item ${index === activeWikiSuggestionIndex ? 'chat-compose-wikilink-item-active' : ''}`}
								onMouseDown={(event) => {
									event.preventDefault()
									apply_wiki_suggestion(option.title)
								}}
							>
								<span>{option.title}</span>
							</button>
						))}
					</div>
				)}
				<div className="chat-model-picker" ref={modelMenuRef}>
					<button
						type="button"
						className="chat-model-trigger"
						onClick={() => setModelMenuOpen((v) => !v)}
						disabled={sending || assistantTyping}
						title="Select AI model"
						aria-label="Select AI model"
						aria-expanded={modelMenuOpen}
					>
						<span className="chat-model-trigger-label">{display_model_label}</span>
						{modelMenuOpen ? (
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="chat-model-caret"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M11.293 7.293a1 1 0 0 1 1.32 -.083l.094 .083l6 6l.083 .094l.054 .077l.054 .096l.017 .036l.027 .067l.032 .108l.01 .053l.01 .06l.004 .057l.002 .059l-.002 .059l-.005 .058l-.009 .06l-.01 .052l-.032 .108l-.027 .067l-.07 .132l-.065 .09l-.073 .081l-.094 .083l-.077 .054l-.096 .054l-.036 .017l-.067 .027l-.108 .032l-.053 .01l-.06 .01l-.057 .004l-.059 .002h-12c-.852 0 -1.297 -.986 -.783 -1.623l.076 -.084l6 -6z" /></svg>
						) : (
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="chat-model-caret"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M18 9c.852 0 1.297 .986 .783 1.623l-.076 .084l-6 6a1 1 0 0 1 -1.32 .083l-.094 -.083l-6 -6l-.083 -.094l-.054 -.077l-.054 -.096l-.017 -.036l-.027 -.067l-.032 -.108l-.01 -.053l-.01 -.06l-.004 -.057v-.118l.005 -.058l.009 -.06l.01 -.052l.032 -.108l.027 -.067l.07 -.132l.065 -.09l.073 -.081l.094 -.083l.077 -.054l.096 -.054l.036 -.017l.067 -.027l.108 -.032l.053 -.01l.06 -.01l.057 -.004l12.059 -.002z" /></svg>
						)}
					</button>
					{modelMenuOpen && (
						<div className="chat-model-dropdown">
							<div className="chat-model-search-row">
								<input
									ref={modelSearchInputRef}
									type="text"
									className="search-input"
									value={modelSearch}
									onChange={(event) => { setModelSearch(event.target.value); setModelMenuActiveIndex(0) }}
									onKeyDown={(event) => {
										if ('ArrowDown' === event.key) {
											event.preventDefault()
											setModelMenuActiveIndex((idx) => Math.min(idx + 1, filtered_models.length))
											return
										}
										if ('ArrowUp' === event.key) {
											event.preventDefault()
											setModelMenuActiveIndex((idx) => Math.max(idx - 1, 0))
											return
										}
										if ('Escape' === event.key) {
											event.preventDefault()
											setModelMenuOpen(false)
											return
										}
										if ('Enter' === event.key) {
											event.preventDefault()
											if (0 === filtered_models.length) return
											const option = filtered_models[modelMenuActiveIndex]
											if (option) {
												setOptimisticModel(option.model)
												onSetThreadModel(option.model)
												setModelMenuOpen(false)
											}
											return
										}
									}}
									placeholder="Search models…"
									spellCheck={false}
								/>
							</div>
							<div className="chat-model-list" role="listbox">
								<button
									type="button"
									className={`chat-model-option ${null !== optimisticModel && '' === optimisticModel ? 'chat-model-option-active' : ''}`}
									onClick={() => { setOptimisticModel(''); onSetThreadModel(''); setModelMenuOpen(false) }}
									role="option"
									aria-selected={null !== optimisticModel && '' === optimisticModel}
								>
									Auto
								</button>
								{filtered_models.map((entry, index) => (
									<button
										key={`${entry.providerId}:${entry.model}`}
										type="button"
										className={`chat-model-option ${entry.model === optimisticModel ? 'chat-model-option-active' : ''} ${index === modelMenuActiveIndex ? 'chat-model-option-focus' : ''}`}
										onClick={() => { setOptimisticModel(entry.model); onSetThreadModel(entry.model); setModelMenuOpen(false) }}
										role="option"
										aria-selected={entry.model === optimisticModel}
									>
										<span className="chat-model-option-provider">{entry.providerLabel}</span>
										<span className="chat-model-option-model">{entry.model}</span>
									</button>
								))}
								{0 === filtered_models.length && (
									<p className="tags-label" style={{ padding: '8px', textAlign: 'center', margin: 0 }}>No models match</p>
								)}
							</div>
						</div>
					)}
				</div>
				<button
					className={`icon-button chat-mic-button ${isDictating ? 'chip-active chat-mic-recording' : ''}`}
					type="button"
					onClick={() => void toggleDictation()}
					disabled={sending || assistantTyping || isTranscribing}
					title={isDictating ? 'Stop dictation' : 'Start dictation'}
					aria-label={isDictating ? 'Stop dictation' : 'Start dictation'}
				>
					<MicrophoneIcon />
				</button>
				<button className="icon-button chat-send-button" type="submit" disabled={sending || assistantTyping || isDictating || isTranscribing || !draft.trim()} title={sending ? 'Sending…' : 'Send message'} aria-label={sending ? 'Sending' : 'Send message'}><SendIcon /></button>
			</form>
			{copyToastText && <span className="copy-toast" role="status" aria-live="polite">{copyToastText}</span>}
			{showSearchModal && (
				<div className="modal-overlay palette-overlay" onClick={() => {
					setShowSearchModal(false)
					onClearSearch()
				}}>
					<div className="palette-card chat-search-modal" onClick={(event) => event.stopPropagation()}>
						<div className="palette-search-row">
							<span className="palette-mode-badge">Chats</span>
							<input
								ref={chatSearchInputRef}
								className="palette-search-input"
								placeholder="Search chat titles..."
								value={searchQuery}
								onChange={(event) => {
									const value = event.target.value
									onSearchQueryChange(value)
									if (!value.trim()) onClearSearch()
									else onRunSearch(value)
								}}
								onKeyDown={(event) => {
									if ('Enter' === event.key) {
										event.preventDefault()
										onRunSearch(searchQuery)
									}
								}}
							/>
							<button className="icon-button palette-search-close-btn" onClick={() => {
								setShowSearchModal(false)
								onClearSearch()
							}} aria-label="Close chat search" title="Close chat search">
								<CloseIcon />
							</button>
						</div>
						<div className="palette-results chat-search-modal-results">
							{chat_search_results.length > 0 ? (
								chat_search_results.map((result) => (
									<button
										key={result.threadId}
										className="chat-search-item"
										onClick={() => {
											onSelectThread(result.threadId)
											setShowSearchModal(false)
											onClearSearch()
										}}
										title={result.title}
									>
										<strong>{result.title}</strong>
										<span>{result.preview}</span>
									</button>
								))
							) : (
								<p className="palette-empty">{searchQuery.trim() ? 'No matching chats.' : 'No chats yet. Start a new chat to build history.'}</p>
							)}
						</div>
					</div>
				</div>
			)}
			{showUsageModal && (
				<div className="modal-overlay" onClick={() => setShowUsageModal(false)}>
					<div className="modal-card chat-usage-modal" onClick={(event) => event.stopPropagation()}>
						<div className="chat-usage-modal-header">
							<div>
								<h3>Chat Usage</h3>
								<p className="chat-usage-modal-subtitle">Analytics from routed model logs for this chat thread.</p>
							</div>
							<button className="icon-button" onClick={() => setShowUsageModal(false)} aria-label="Close usage modal" title="Close usage modal"><CloseIcon /></button>
						</div>
						{chatUsageLoading ? (
							<p className="chat-usage-empty">Loading usage analytics…</p>
						) : chatUsageSummary ? (
							<>
								<div className="chat-usage-kpis">
									<article className="chat-usage-kpi-card">
										<span className="chat-usage-kpi-label">Total Tokens</span>
										<strong className="chat-usage-kpi-value">{format_token_count(chatUsageSummary.totalTokens)}</strong>
									</article>
									<article className="chat-usage-kpi-card">
										<span className="chat-usage-kpi-label">Input</span>
										<strong className="chat-usage-kpi-value">{format_token_count(chatUsageSummary.inputTokens)}</strong>
									</article>
									<article className="chat-usage-kpi-card">
										<span className="chat-usage-kpi-label">Output</span>
										<strong className="chat-usage-kpi-value">{format_token_count(chatUsageSummary.outputTokens)}</strong>
									</article>
									<article className="chat-usage-kpi-card">
										<span className="chat-usage-kpi-label">Implied Cost</span>
										<strong className="chat-usage-kpi-value">{format_implied_cost(chatUsageSummary.impliedCostUsd)}</strong>
									</article>
								</div>
								{chatUsageSummary.providers.length > 0 ? (
									<div className="chat-usage-provider-list">
										{chatUsageSummary.providers.map((provider) => (
											<article key={`${provider.providerId}-${provider.model}`} className="chat-usage-provider-card">
												<strong>{provider.model || 'unknown-model'}</strong>
												<span className="chat-usage-provider-name">{`Provider: ${provider.providerId || 'unknown'}`}</span>
												<div className="chat-usage-provider-metrics">
													<span>{`Requests: ${format_token_count(provider.requests)}`}</span>
													<span>{`Input tokens: ${format_token_count(provider.inputTokens)}`}</span>
													<span>{`Output tokens: ${format_token_count(provider.outputTokens)}`}</span>
													<span>{`Implied cost: ${format_implied_cost(provider.impliedCostUsd)}`}</span>
													<span>{`Cached input: n/a`}</span>
													<span>{`Prefill tokens: n/a`}</span>
													<span>{`Context window used: n/a`}</span>
												</div>
											</article>
										))}
									</div>
								) : (
									<p className="chat-usage-empty">No model usage has been logged for this chat yet.</p>
								)}
							</>
						) : (
							<p className="chat-usage-empty">No usage data yet. Send a message in this chat to generate analytics.</p>
						)}
					</div>
				</div>
			)}
			{showDeleteConfirm && (
				<div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
					<div className="modal-card" onClick={(event) => event.stopPropagation()}>
						<h3>Delete chat</h3>
						<p>This chat thread will be removed permanently.</p>
						<div className="modal-actions">
							<button className="ghost-button" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</button>
							<button className="primary-button" onClick={() => {
								void onDeleteThread().finally(() => setShowDeleteConfirm(false))
							}} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete chat'}</button>
						</div>
					</div>
				</div>
			)}
		</aside>
	)
}
