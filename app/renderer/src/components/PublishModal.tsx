import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './icons'

interface PublishModalProps {
	open: boolean
	noteTitle: string
	noteContent: string
	onClose: () => void
}

type ExportFormat = 'html' | 'pdf' | 'doc'

export function PublishModal({ open, noteTitle, noteContent, onClose }: PublishModalProps) {
	const [status, setStatus] = useState<'idle' | 'selecting' | 'publishing' | 'done' | 'error'>('idle')
	const [format, setFormat] = useState<ExportFormat>('html')
	const [message, setMessage] = useState('')
	const [publishedPath, setPublishedPath] = useState('')
	const overlayRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		const onKeyDown = (event: KeyboardEvent) => {
			if ('Escape' === event.key) { event.preventDefault(); onClose() }
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [open, onClose])

	useEffect(() => {
		if (!open) { setStatus('idle'); setMessage(''); setPublishedPath('') }
	}, [open])

	if (!open) return null

	const handleExport = async () => {
		setStatus('publishing')
		setMessage('Rendering…')

		try {
			if ('html' === format) {
				// HTML: needs folder selection
				setStatus('selecting')
				const folder = await window.strata.publish.selectFolder()
				if (!folder) { setStatus('idle'); return }
				setStatus('publishing')
				const html = renderPublishHtml(noteTitle, noteContent)
				const result = await window.strata.publish.htmlFile({ destination: folder, title: noteTitle, html })
				if (result.success) {
					setStatus('done')
					setPublishedPath(result.path || folder)
					setMessage('Exported successfully!')
				} else {
					setStatus('error')
					setMessage(result.error || 'Export failed.')
				}
			} else if ('pdf' === format) {
				const html = renderPublishHtml(noteTitle, noteContent)
				const pdf_bytes = await window.strata.exports.pdf({ html })
				const pdf_data = pdf_bytes instanceof Uint8Array ? pdf_bytes : new Uint8Array(pdf_bytes)
				const blob = new Blob([pdf_data as BlobPart], { type: 'application/pdf' })
				triggerDownload(blob, sanitizeFileName(noteTitle) + '.pdf')
				setStatus('done')
				setPublishedPath(sanitizeFileName(noteTitle) + '.pdf')
				setMessage('PDF downloaded.')
			} else if ('doc' === format) {
				const html = renderPublishHtml(noteTitle, noteContent)
				const blob = new Blob([html], { type: 'application/msword;charset=utf-8' })
				triggerDownload(blob, sanitizeFileName(noteTitle) + '.doc')
				setStatus('done')
				setPublishedPath(sanitizeFileName(noteTitle) + '.doc')
				setMessage('DOC downloaded.')
			}
		} catch (err) {
			setStatus('error')
			setMessage(err instanceof Error ? err.message : 'Export failed.')
		}
	}

	return createPortal(
		<div className="modal-overlay" ref={overlayRef} onMouseDown={(event) => { if (event.target === overlayRef.current) onClose() }}>
			<div className="modal-card related-notes-modal" onClick={(event) => event.stopPropagation()}>
				<h3 className="related-notes-heading">Export / Publish</h3>
				<button className="icon-button modal-close-button" onClick={onClose} aria-label="Close"><CloseIcon /></button>

				{('idle' === status || 'selecting' === status) && (
					<>
						<div className="publish-format-row">
							{([
								['html', 'HTML File', 'Self-contained webpage with light/dark theme'],
								['pdf', 'PDF', 'Print-ready PDF document'],
								['doc', 'DOC', 'Microsoft Word compatible document'],
							] as [ExportFormat, string, string][]).map(([fmt, label, desc]) => (
								<label key={fmt} className={`publish-format-option ${format === fmt ? 'publish-format-active' : ''}`}>
									<input type="radio" name="format" value={fmt} checked={format === fmt} onChange={() => setFormat(fmt)} />
									<span className="publish-format-label">{label}</span>
									<span className="publish-format-desc">{desc}</span>
								</label>
							))}
						</div>
						<button className="primary-button publish-action-btn" onClick={handleExport}>
							{'html' === format ? 'Choose Folder & Export' : `Export as ${format.toUpperCase()}`}
						</button>
					</>
				)}

				{'publishing' === status && (
					<div className="publish-status">{message}</div>
				)}

				{'done' === status && (
					<div className="publish-result publish-result-success">
						<div className="publish-result-icon">✓</div>
						<div className="publish-result-title">{message}</div>
						<div className="publish-result-path">{publishedPath}</div>
						<button className="ghost-button" onClick={onClose}>Close</button>
					</div>
				)}

				{'error' === status && (
					<div className="publish-result publish-result-error">
						<div className="publish-result-icon">✗</div>
						<div className="publish-result-title">Export failed</div>
						<div className="publish-result-path">{message}</div>
						<button className="ghost-button" onClick={() => setStatus('idle')}>Try Again</button>
					</div>
				)}
			</div>
		</div>,
		document.body,
	)
}

const sanitizeFileName = (name: string): string =>
	name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'untitled-note'

const triggerDownload = (blob: Blob, filename: string) => {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	link.remove()
	URL.revokeObjectURL(url)
}

/** Render a self-contained HTML document for publishing/export. */
function renderPublishHtml(title: string, content: string): string {
	const body = basicMarkdownToHtml(content)
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; --bg: #fff; --text: #1f2730; --text-2: #5a6670; --border: #d6dbe0; --code-bg: #eef1f4; --accent: #3c6e8f; }
@media (prefers-color-scheme: dark) { :root { --bg: #0e1113; --text: #e6e9ec; --text-2: #8a949e; --border: #2a3036; --code-bg: #1a1d21; --accent: #5c9ecf; } }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--text); background: var(--bg); margin: 40px auto; max-width: 720px; padding: 0 24px; line-height: 1.6; }
h1,h2,h3,h4 { color: var(--text); margin: 24px 0 12px; }
p,ul,ol,blockquote,pre,table { margin: 0 0 16px; }
code { background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: 0 4px; font-family: ui-monospace, monospace; }
pre code { display: block; padding: 12px; white-space: pre-wrap; }
blockquote { border-left: 3px solid var(--accent); padding-left: 12px; color: var(--text-2); margin-left: 0; }
a { color: var(--accent); }
table { border-collapse: collapse; width: 100%; } th,td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; } th { background: var(--code-bg); }
</style>
</head>
<body>${body}</body>
</html>`
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function basicMarkdownToHtml(md: string): string {
	let html = md
		.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
		.replace(/^### (.+)$/gm, '<h3>$1</h3>')
		.replace(/^## (.+)$/gm, '<h2>$1</h2>')
		.replace(/^# (.+)$/gm, '<h1>$1</h1>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		.replace(/~~(.+?)~~/g, '<del>$1</del>')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
		.replace(/^---$/gm, '<hr />')
		.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')
		.replace(/^- (.+)$/gm, '<li>$1</li>')
		.replace(/\n\n/g, '</p><p>')
	html = '<p>' + html + '</p>'
	html = html.replace(/(<li>.*?<\/li>)(?:\s*(<li>.*?<\/li>))+/g, '<ul>$&</ul>')
	html = html.replace(/<p>\s*<\/p>/g, '')
	return html
}
