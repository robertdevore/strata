import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AiMessage, AiSearchResult, AiThreadSummary } from '@shared/types'
import { aiService } from '@renderer/src/services/aiService'
import { MessageOffIcon, MessagePlusIcon, MicrophoneIcon, SearchIcon, SendIcon } from './icons'

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
	noteTitlesById: Record<string, string>
	searchQuery: string
	searchResults: AiSearchResult[]
	loadingThreads: boolean
	loadingMessages: boolean
	sending: boolean
	assistantTyping: boolean
	deleting: boolean
	errorMessage: string
	onSelectThread: (thread_id: string) => void
	onCreateThread: () => void
	onDeleteThread: () => Promise<void>
	onSearchQueryChange: (value: string) => void
	onRunSearch: () => void
	onClearSearch: () => void
	onSendMessage: (message: string) => Promise<void>
	onOpenNote: (note_id: string) => void
}

const note_id_pattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

const normalize_note_id = (value: string): string => value.toLowerCase()

const escape_markdown_label = (value: string): string => value.replace(/[\\\[\]\(\)]/g, '\\$&')

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

export function ChatPanel(props: ChatPanelProps) {
	const {
		threads,
		activeThreadId,
		messages,
		modelName,
		noteTitlesById,
		searchQuery,
		searchResults,
		loadingThreads,
		loadingMessages,
		sending,
		assistantTyping,
		deleting,
		errorMessage,
		onSelectThread,
		onCreateThread,
		onDeleteThread,
		onSearchQueryChange,
		onRunSearch,
		onClearSearch,
		onSendMessage,
		onOpenNote,
	} = props
	const assistant_label = `Strata AI - ${modelName || 'gpt-4o'}`
	const [draft, setDraft] = useState('')
	const [showSearchBar, setShowSearchBar] = useState(false)
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
	const [thinkingDots, setThinkingDots] = useState('.')
	const [isDictating, setIsDictating] = useState(false)
	const [isTranscribing, setIsTranscribing] = useState(false)
	const [dictationError, setDictationError] = useState('')
	const [liveDictationText, setLiveDictationText] = useState('')
	const liveDictationTextRef = useRef('')
	const chatMessagesRef = useRef<HTMLDivElement | null>(null)
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
		if (!chatMessagesRef.current) return
		chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
	}, [messages, sending, assistantTyping])

	useEffect(() => {
		liveDictationTextRef.current = liveDictationText
	}, [liveDictationText])

	useEffect(() => {
		return () => {
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
					<select
						value={activeThreadId ?? ''}
						onChange={(event) => onSelectThread(event.target.value)}
						disabled={loadingThreads || 0 === threads.length}
						title="Select chat thread"
					>
						<option value="">New chat</option>
						{threads.map((item) => (
							<option key={item.thread.id} value={item.thread.id}>
								{item.thread.title}
							</option>
						))}
					</select>
					<button className="icon-button" onClick={onCreateThread} title="New chat" aria-label="New chat"><MessagePlusIcon /></button>
					<button className="icon-button" onClick={() => setShowDeleteConfirm(true)} disabled={!activeThreadId || deleting} title="Delete chat" aria-label="Delete chat"><MessageOffIcon /></button>
					<button className={`icon-button ${showSearchBar ? 'chip-active' : ''}`} onClick={() => {
						setShowSearchBar((value) => !value)
						if (showSearchBar) {
							onClearSearch()
						}
					}} title="Search chats" aria-label="Search chats"><SearchIcon /></button>
				</div>
				{showSearchBar && <div className="chat-search-row">
					<input
						className="search-input"
						placeholder="Search previous chats"
						value={searchQuery}
						onChange={(event) => onSearchQueryChange(event.target.value)}
						onKeyDown={(event) => {
							if ('Enter' === event.key) {
								event.preventDefault()
								onRunSearch()
							}
						}}
					/>
					<button className="ghost-button" onClick={onRunSearch}>Search</button>
					{searchResults.length > 0 && <button className="ghost-button" onClick={onClearSearch}>Clear</button>}
				</div>}
			</div>

			{searchResults.length > 0 && (
				<div className="chat-search-results">
					{searchResults.map((result) => (
						<button
							key={result.message.id}
							className="chat-search-item"
							onClick={() => onSelectThread(result.thread.id)}
							title={result.thread.title}
						>
							<strong>{result.thread.title}</strong>
							<span>{trim_message_preview(result.message.content)}</span>
						</button>
					))}
				</div>
			)}

			<div className="chat-messages" aria-live="polite" ref={chatMessagesRef}>
				{loadingMessages ? (
					<p className="chat-placeholder">Loading messages…</p>
				) : (
					<>
						{messages.map((message) => (
							<div key={message.id} className={`chat-bubble chat-${message.role}`}>
								<div className="chat-bubble-meta">
									<span>{'user' === message.role ? 'You' : assistant_label}</span>
									<time>{format_time(message.createdAt)}</time>
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
																	onOpenNote(note_id)
																}}
																className="chat-note-link"
															>
																{children}
															</a>
														)
													}

													return <a href={target} target="_blank" rel="noreferrer">{children}</a>
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
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if ('Enter' !== event.key || event.shiftKey) return
						event.preventDefault()
						const next = draft.trim()
						if (!next || sending || assistantTyping || isDictating || isTranscribing) return
						void onSendMessage(next)
						setDraft('')
					}}
					placeholder="Message Strata AI…"
					rows={3}
					disabled={sending || assistantTyping}
				/>
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
