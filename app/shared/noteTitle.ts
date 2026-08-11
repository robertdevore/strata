export const deriveNoteTitle = (content: string): string => {
	const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
	if (lines.length === 0) return 'Untitled'
	const heading = lines.find((line) => /^#{1,6}\s+/.test(line))
	if (heading) {
		const normalized = heading.replace(/^#{1,6}\s+/, '').trim()
		return normalized || 'Untitled'
	}
	return lines[0].slice(0, 80)
}
