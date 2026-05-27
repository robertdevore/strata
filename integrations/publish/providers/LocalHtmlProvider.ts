import type { Note } from '../../../app/shared/types'
import type { PublishProvider, PublishContext, PublishResult } from '../PublishProvider'

export class LocalHtmlProvider implements PublishProvider {
	id = 'local-html'
	displayName = 'Local HTML File'
	description = 'Export the note as a styled HTML file to a folder on your computer.'
	requiresDestination = true

	async publish(note: Note, context: PublishContext): Promise<PublishResult> {
		const dest = context.destination
		if (!dest) return { success: false, message: 'No destination folder selected.' }

		const title = context.title || 'Untitled'
		const safe_name = sanitize_filename(title) + '.html'
		const html = render_html(title, note.content)
		const fs = await import('node:fs/promises')
		const path = await import('node:path')

		const file_path = path.default.join(dest, safe_name)

		try {
			await fs.default.writeFile(file_path, html, 'utf-8')
			return { success: true, message: `Published to ${file_path}`, path: file_path }
		} catch (err) {
			return { success: false, message: `Failed to write file: ${err instanceof Error ? err.message : String(err)}` }
		}
	}
}

const sanitize_filename = (name: string): string => {
	return name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'untitled-note'
}

const render_html = (title: string, content: string): string => {
	// Render a styled HTML page from note content
	const body_html = basic_markdown_to_html(content)
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape_html(title)}</title>
<style>
:root {
	color-scheme: light dark;
	--bg: #ffffff;
	--text: #1f2730;
	--text-2: #5a6670;
	--border: #d6dbe0;
	--code-bg: #eef1f4;
	--accent: #3c6e8f;
}
@media (prefers-color-scheme: dark) {
	:root {
		--bg: #0e1113;
		--text: #e6e9ec;
		--text-2: #8a949e;
		--border: #2a3036;
		--code-bg: #1a1d21;
		--accent: #5c9ecf;
	}
}
body {
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	color: var(--text);
	background: var(--bg);
	margin: 40px auto;
	max-width: 720px;
	padding: 0 24px;
	line-height: 1.6;
}
h1,h2,h3,h4,h5,h6 { color: var(--text); margin: 24px 0 12px; }
p,ul,ol,blockquote,pre,table { margin: 0 0 16px; }
code {
	background: var(--code-bg);
	border: 1px solid var(--border);
	border-radius: 6px;
	padding: 0 4px;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
pre code { display: block; padding: 12px; white-space: pre-wrap; }
blockquote {
	border-left: 3px solid var(--accent);
	padding-left: 12px;
	color: var(--text-2);
	margin-left: 0;
}
a { color: var(--accent); }
table { border-collapse: collapse; width: 100%; }
th,td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
th { background: var(--code-bg); }
@media print {
	body { max-width: none; margin: 0; }
}
</style>
</head>
<body>
${body_html}
</body>
</html>`
}

const escape_html = (text: string): string => {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Minimal markdown-to-HTML for basic formatting in published output. */
const basic_markdown_to_html = (md: string): string => {
	let html = md
		// Code blocks (fenced)
		.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
			return `<pre><code class="language-${lang || 'text'}">${escape_html(code.trim())}</code></pre>`
		})
		// Inline code
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		// Headings
		.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
		.replace(/^### (.+)$/gm, '<h3>$1</h3>')
		.replace(/^## (.+)$/gm, '<h2>$1</h2>')
		.replace(/^# (.+)$/gm, '<h1>$1</h1>')
		// Bold and italic
		.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		// Strikethrough
		.replace(/~~(.+?)~~/g, '<del>$1</del>')
		// Images
		.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
		// Links (non-wiki)
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
		// Horizontal rules
		.replace(/^---$/gm, '<hr />')
		// Blockquotes
		.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')
		// Unordered lists
		.replace(/^- (.+)$/gm, '<li>$1</li>')
		// Paragraphs (double newlines)
		.replace(/\n\n/g, '</p><p>')

	html = '<p>' + html + '</p>'
	// Wrap consecutive <li> in <ul>
	html = html.replace(/(<li>.*?<\/li>)(?:\s*(<li>.*?<\/li>))+/g, '<ul>$&</ul>')
	// Clean up empty paragraphs
	html = html.replace(/<p>\s*<\/p>/g, '')
	return html
}
