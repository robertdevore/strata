/**
 * Wiki link parser — extracts [[Target]], [[Target|Label]], and [[Target#Heading]] links from markdown.
 */

export interface ParsedWikiLink {
	rawTarget: string
	label: string | null
	heading: string | null
	startIndex: number
	endIndex: number
}

/**
 * Match [[...]] wiki links. Does not match ![[...]] embeds.
 */
const WIKI_LINK_RE = /(?<!!)\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

export const parseWikiLinks = (content: string): ParsedWikiLink[] => {
	const links: ParsedWikiLink[] = []
	let match: RegExpExecArray | null
	// Reset regex state
	WIKI_LINK_RE.lastIndex = 0
	while ((match = WIKI_LINK_RE.exec(content)) !== null) {
		const rawTarget = (match[1] ?? '').trim()
		const heading = match[2]?.trim() ?? null
		const label = match[3]?.trim() ?? null
		links.push({
			rawTarget,
			label,
			heading,
			startIndex: match.index,
			endIndex: match.index + match[0].length,
		})
	}
	return links
}

/**
 * Normalize a note title for matching: lowercase, trimmed, collapsed whitespace.
 * Mirrors the title derivation used elsewhere but for raw wiki-link targets.
 */
export const normalizeWikiTarget = (raw: string): string => {
	return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}
