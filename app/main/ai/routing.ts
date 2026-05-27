// Strata AI Router — keyphrase-based routing for cheap vs premium providers
// Determines intent, risk, and route from user messages

import type { AiIntent, AiRiskLevel, AiRouteDecision, AiRouteTarget, AiRoutingMode } from './types'

// ---- Routing Configuration ----

export interface RouterConfig {
	mode: AiRoutingMode
	cheapConfidenceThreshold: number    // default 0.85
	premiumFallbackThreshold: number    // default 0.65
}

const DEFAULT_CONFIG: RouterConfig = {
	mode: 'auto',
	cheapConfidenceThreshold: 0.85,
	premiumFallbackThreshold: 0.65,
}

// ---- Keyphrase maps ----

interface KeyphraseRule {
	intent: AiIntent
	risk: AiRiskLevel
	route: AiRouteTarget
	requiresConfirmation: boolean
	confidence: number
}

// Ordered rules — first match wins
const KEYPHRASE_RULES: Array<{ keyphrases: string[]; rule: KeyphraseRule }> = [
	// BLOCKED: destructive / delete requests
	{
		keyphrases: [
			'delete note', 'delete the note', 'remove note', 'destroy note',
			'delete all notes', 'delete my notes', 'delete everything',
			'permanently delete', 'wipe notes',
		],
		rule: {
			intent: 'unknown',
			risk: 'high',
			route: 'blocked',
			requiresConfirmation: true,
			confidence: 1.0,
		},
	},

	// PREMIUM: code architecture / large-scale review
	{
		keyphrases: [
			'code architecture', 'architectural review', 'system design',
			'repo-wide', 'repository review', 'codebase review',
			'review the codebase', 'analyze the codebase', 'audit the code',
			'architecture decision', 'design pattern', 'refactor plan',
			'product strategy', 'strategic', 'roadmap',
		],
		rule: {
			intent: 'code_architecture',
			risk: 'medium',
			route: 'premium',
			requiresConfirmation: false,
			confidence: 0.95,
		},
	},

	// PREMIUM: complex reasoning / multi-note synthesis
	{
		keyphrases: [
			'long-context', 'synthesize across', 'synthesize notes',
			'compare all', 'analyze relationships', 'deep analysis',
			'comprehensive review', 'cross-reference', 'reason about',
			'complex reasoning', 'multi-step reasoning',
		],
		rule: {
			intent: 'complex_reasoning',
			risk: 'medium',
			route: 'premium',
			requiresConfirmation: false,
			confidence: 0.90,
		},
	},

	// PREMIUM: existing note update (requires explicit request)
	{
		keyphrases: [
			'edit the note', 'update the note', 'modify the note',
			'change the note', 'revise the note', 'rewrite the note',
			'append to the note', 'add to the note',
		],
		rule: {
			intent: 'update_note',
			risk: 'medium',
			route: 'premium',
			requiresConfirmation: true,
			confidence: 0.88,
		},
	},

	// CHEAP: simple note creation
	{
		keyphrases: [
			'create a note', 'new note', 'make a note', 'write a note',
			'add a note', 'draft a note', 'start a note', 'capture this',
			'save this as a note', 'record this', 'jot down',
		],
		rule: {
			intent: 'create_note',
			risk: 'low',
			route: 'cheap',
			requiresConfirmation: false,
			confidence: 0.95,
		},
	},

	// CHEAP: tagging
	{
		keyphrases: [
			'tag', 'add tags', 'categorize', 'label', 'classify notes',
			'organize notes',
		],
		rule: {
			intent: 'tag_note',
			risk: 'low',
			route: 'cheap',
			requiresConfirmation: false,
			confidence: 0.92,
		},
	},

	// CHEAP: TODO extraction
	{
		keyphrases: [
			'extract todos', 'extract tasks', 'find tasks', 'list tasks',
			'what do i need to do', 'action items', 'todo list',
			'create todo', 'extract action items',
		],
		rule: {
			intent: 'extract_tasks',
			risk: 'low',
			route: 'cheap',
			requiresConfirmation: false,
			confidence: 0.90,
		},
	},

	// CHEAP: search / search-query rewrite
	{
		keyphrases: [
			'search for', 'find notes about', 'look up', 'find me',
			'show me notes', 'what notes', 'which notes', 'do i have notes',
			'search notes', 'find references',
		],
		rule: {
			intent: 'search_notes',
			risk: 'low',
			route: 'cheap',
			requiresConfirmation: false,
			confidence: 0.93,
		},
	},

	// CHEAP: summarization
	{
		keyphrases: [
			'summarize', 'sum up', 'give me a summary', 'tldr',
			'what does this note say', 'recap',
		],
		rule: {
			intent: 'summarize_note',
			risk: 'low',
			route: 'cheap',
			requiresConfirmation: false,
			confidence: 0.88,
		},
	},

	// CHEAP: rewrite/search-query
	{
		keyphrases: [
			'rewrite this search', 'improve this query', 'better search',
			'search query',
		],
		rule: {
			intent: 'rewrite_search',
			risk: 'low',
			route: 'cheap',
			requiresConfirmation: false,
			confidence: 0.87,
		},
	},
]

// ---- Fuzzy match helper ----

const normalize_for_matching = (text: string): string => {
	return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

const fuzzy_score = (phrase: string, input: string): number => {
	// Simple substring match scoring
	const norm_input = normalize_for_matching(input)
	const norm_phrase = normalize_for_matching(phrase)

	if (norm_input.includes(norm_phrase)) return 1.0

	// Check word overlap
	const input_words = new Set(norm_input.split(' '))
	const phrase_words = norm_phrase.split(' ')
	const overlap = phrase_words.filter((w) => input_words.has(w)).length
	if (phrase_words.length === 0) return 0

	return overlap / phrase_words.length
}

// ---- Main router ----

export const route_ai_request = (
	user_message: string,
	config: Partial<RouterConfig> = {},
): AiRouteDecision => {
	const resolved_config: RouterConfig = { ...DEFAULT_CONFIG, ...config }

	// Mode overrides
	if ('premium_only' === resolved_config.mode) {
		return {
			route: 'premium',
			intent: 'unknown',
			confidence: 1.0,
			risk: 'low',
			requiresConfirmation: false,
			reason: 'Routing mode set to premium-only',
		}
	}

	if ('cheap_only' === resolved_config.mode) {
		return {
			route: 'cheap',
			intent: 'unknown',
			confidence: 1.0,
			risk: 'low',
			requiresConfirmation: false,
			reason: 'Routing mode set to cheap-only',
		}
	}

	// Check keyphrase rules in order
	let best_match: { rule: KeyphraseRule; score: number } | null = null

	for (const { keyphrases, rule } of KEYPHRASE_RULES) {
		for (const phrase of keyphrases) {
			const score = fuzzy_score(phrase, user_message)
			if (score > 0.7 && (!best_match || score > best_match.score)) {
				best_match = { rule, score }
			}
		}
	}

	if (best_match) {
		const { rule, score } = best_match
		const adjusted_confidence = Math.min(1.0, rule.confidence * score)

		// Blocked is always blocked
		if ('blocked' === rule.route) {
			return {
				route: 'blocked',
				intent: rule.intent,
				confidence: adjusted_confidence,
				risk: rule.risk,
				requiresConfirmation: rule.requiresConfirmation,
				reason: 'Destructive or blocked request detected',
			}
		}

		// If auto mode, apply thresholds for cheap vs premium
		if ('auto' === resolved_config.mode) {
			if ('cheap' === rule.route && adjusted_confidence < resolved_config.cheapConfidenceThreshold) {
				return {
					route: 'premium',
					intent: rule.intent,
					confidence: adjusted_confidence,
					risk: rule.risk,
					requiresConfirmation: rule.requiresConfirmation,
					reason: `Cheap provider confidence (${adjusted_confidence.toFixed(2)}) below threshold — escalated to premium`,
				}
			}

			if ('premium' === rule.route && adjusted_confidence < resolved_config.premiumFallbackThreshold) {
				return {
					route: 'premium',
					intent: rule.intent,
					confidence: adjusted_confidence,
					risk: 'high' === rule.risk ? 'high' : 'medium',
					requiresConfirmation: true,
					reason: `Low confidence (${adjusted_confidence.toFixed(2)}) — premium with confirmation`,
				}
			}
		}

		return {
			route: rule.route,
			intent: rule.intent,
			confidence: adjusted_confidence,
			risk: rule.risk,
			requiresConfirmation: rule.requiresConfirmation,
			reason: `Matched: ${rule.intent.replace(/_/g, ' ')} (confidence: ${adjusted_confidence.toFixed(2)})`,
		}
	}

	// No match — default to premium for safety
	return {
		route: 'premium',
		intent: 'unknown',
		confidence: 0.5,
		risk: 'low',
		requiresConfirmation: false,
		reason: 'No intent matched — defaulting to premium for safety',
	}
}
