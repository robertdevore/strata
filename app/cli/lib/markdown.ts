export const normalize_whitespace = (value: string): string => {
	return value.replace(/\r\n/g, '\n').replace(/\t/g, '    ').replace(/\u00a0/g, ' ').trim()
}

export const derive_title_from_markdown = (content: string): string => {
	const normalized = normalize_whitespace(content)
	const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean)
	if (0 === lines.length) return 'Untitled'

	const heading = lines.find((line) => line.startsWith('# '))
	if (heading) return heading.slice(2).trim() || 'Untitled'

	const first_line = lines[0]
	return first_line.length > 80 ? `${first_line.slice(0, 77)}...` : first_line
}

export const make_markdown_note = (title: string, body: string): string => {
	const clean_title = normalize_whitespace(title).replace(/^#\s+/, '') || 'Untitled'
	const clean_body = body.replace(/\r\n/g, '\n').trim()
	if (!clean_body) {
		return `# ${clean_title}\n`
	}
	return `# ${clean_title}\n\n${clean_body}`
}

export const append_markdown = (current_content: string, appendix: string): string => {
	const base = current_content.replace(/\r\n/g, '\n').trimEnd()
	const extra = appendix.replace(/\r\n/g, '\n').trim()
	if (!extra) return base
	if (!base) return extra
	return `${base}\n\n${extra}`
}

export const truncate_preview = (content: string, max_length = 120): string => {
	const normalized = normalize_whitespace(content)
	if (normalized.length <= max_length) return normalized
	return `${normalized.slice(0, max_length - 3)}...`
}

export const normalize_tags = (tags: string[]): string[] => {
	const seen = new Set<string>()
	const normalized: string[] = []
	for (const raw_tag of tags) {
		const tag = raw_tag.trim().toLowerCase().replace(/\s+/g, '-')
		if (!tag) continue
		if (seen.has(tag)) continue
		seen.add(tag)
		normalized.push(tag)
	}
	return normalized
}

const stopwords = new Set([
	'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'with', 'from',
	'this', 'that', 'these', 'those', 'about', 'into', 'before', 'after', 'when',
	'where', 'which', 'while', 'would', 'should', 'could', 'have', 'has', 'had',
	'you', 'your', 'our', 'their', 'his', 'her', 'its', 'they', 'them', 'we', 'i',
])

export const suggest_tags_from_content = (content: string, max_tags = 5): string[] => {
	const words = normalize_whitespace(content)
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length >= 3)
		.filter((word) => !stopwords.has(word))

	const counts = new Map<string, number>()
	for (const word of words) {
		counts.set(word, (counts.get(word) || 0) + 1)
	}

	const ranked = [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, max_tags)
		.map(([word]) => word)

	return normalize_tags(ranked)
}

export interface ExtractedTask {
	text: string
	confidence: number
}

export const extract_tasks_deterministic = (content: string): ExtractedTask[] => {
	const lines = content.replace(/\r\n/g, '\n').split('\n')
	const tasks: ExtractedTask[] = []

	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed) continue
		if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
			tasks.push({ text: trimmed.replace(/^[-*]\s+\[[ xX]\]\s+/, ''), confidence: 0.95 })
			continue
		}
		if (/^[-*]\s+/.test(trimmed)) {
			tasks.push({ text: trimmed.replace(/^[-*]\s+/, ''), confidence: 0.7 })
			continue
		}
		if (/^(todo|action|next|follow-up)[:\s]/i.test(trimmed)) {
			tasks.push({ text: trimmed, confidence: 0.85 })
		}
	}

	return tasks
}
