import { Command } from 'commander'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { route_ai_request } from '../../main/ai/routing'
import { CliError } from '../lib/errors'
import { read_content_input } from '../lib/io'
import { derive_title_from_markdown, make_markdown_note, normalize_tags, suggest_tags_from_content } from '../lib/markdown'
import { print_success } from '../lib/output'
import { route_decision_schema } from '../lib/validators'
import { ExitCode, type CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface RuntimeContext {
	options: CliRuntimeOptions
	client: StrataApiClient
}

const eval_example_schema = z.object({
	id: z.string(),
	input: z.string(),
	expectedIntent: z.string(),
	expectedRoute: z.string(),
	expectedRisk: z.string(),
	requiresConfirmation: z.boolean(),
})

const eval_examples_schema = z.array(eval_example_schema)

const parse_threshold = (raw: string | undefined, fallback: number): number => {
	if (!raw) return fallback
	const parsed = Number.parseFloat(raw)
	if (!Number.isFinite(parsed)) return fallback
	return parsed
}

const resolve_ai_input = async (
	message: string | undefined,
	command_options: { file?: string; stdin?: boolean },
): Promise<string> => {
	if (message && message.trim()) {
		if (command_options.file || command_options.stdin) {
			throw new CliError({
				message: 'Provide either positional message OR --file/--stdin, not both.',
				exitCode: ExitCode.ValidationError,
				code: 'INVALID_AI_INPUT',
			})
		}
		return message
	}

	return await read_content_input({
		file: command_options.file,
		stdin: command_options.stdin,
	})
}

const build_route_decision = (message: string) => {
	const mode = (process.env.STRATA_AI_ROUTING_MODE || 'auto') as 'auto' | 'cheap_only' | 'premium_only' | 'ask_each_time'
	const cheap_threshold = parse_threshold(process.env.STRATA_AI_CHEAP_CONFIDENCE_THRESHOLD, 0.85)
	const premium_threshold = parse_threshold(process.env.STRATA_AI_PREMIUM_FALLBACK_THRESHOLD, 0.65)
	const decision = route_ai_request(message, {
		mode,
		cheapConfidenceThreshold: cheap_threshold,
		premiumFallbackThreshold: premium_threshold,
	})
	return route_decision_schema.parse(decision)
}

const build_ai_note_payload = (raw_input: string): { content: string; tags: string[]; route: ReturnType<typeof build_route_decision> } => {
	const trimmed = raw_input.replace(/\r\n/g, '\n').trim()
	if (!trimmed) {
		throw new CliError({
			message: 'AI note input is empty.',
			exitCode: ExitCode.ValidationError,
			code: 'EMPTY_AI_NOTE_INPUT',
		})
	}

	const route = build_route_decision(trimmed)
	const title = derive_title_from_markdown(trimmed)
	const content = trimmed.startsWith('# ')
		? trimmed
		: make_markdown_note(title, trimmed)
	const suggested_tags = suggest_tags_from_content(trimmed)
	const tags = normalize_tags(['ai', 'agent', ...suggested_tags]).slice(0, 8)
	return { content, tags, route }
}

const run_bench = async (client: StrataApiClient): Promise<Record<string, unknown>> => {
	const started_at = Date.now()
	const health_started = Date.now()
	const health = await client.health()
	const health_ms = Date.now() - health_started

	const tags_started = Date.now()
	const tags = await client.listTags()
	const tags_ms = Date.now() - tags_started

	const search_started = Date.now()
	const search = await client.searchNotes('ai', 10)
	const search_ms = Date.now() - search_started

	return {
		health,
		tagCount: tags.length,
		searchCount: search.length,
		latencyMs: {
			health: health_ms,
			tags: tags_ms,
			search: search_ms,
			total: Date.now() - started_at,
		},
	}
}

const load_eval_examples = async (): Promise<Array<z.infer<typeof eval_example_schema>>> => {
	const eval_file = path.resolve(__dirname, '../../main/ai/evals/routing-examples.json')
	const raw = await fs.readFile(eval_file, 'utf-8')
	const parsed = JSON.parse(raw) as unknown
	return eval_examples_schema.parse(parsed)
}

export const register_ai_commands = (
	program: Command,
	get_context: (command: Command) => RuntimeContext,
): void => {
	const ai = program.command('ai').description('AI routing and AI-assisted note workflows.')

	ai
		.command('route [message]')
		.description('Route a message using Strata routing rules.')
		.option('--file <path>', 'Read prompt from file path')
		.option('--stdin', 'Read prompt from STDIN')
		.action(async function (message: string | undefined, command_options: { file?: string; stdin?: boolean }) {
			const { options } = get_context(this)
			const input = await resolve_ai_input(message, command_options)
			const route = build_route_decision(input)
			print_success(options, {
				ok: true,
				route: route.route,
				intent: route.intent,
				confidence: route.confidence,
				risk: route.risk,
				requiresConfirmation: route.requiresConfirmation,
				reason: route.reason,
			})
		})

	ai
		.command('note [text]')
		.description('Convert messy text into a clean markdown note and create it via HTTP API.')
		.option('--file <path>', 'Read text from file path')
		.option('--stdin', 'Read text from STDIN')
		.action(async function (text: string | undefined, command_options: { file?: string; stdin?: boolean }) {
			const { options, client } = get_context(this)
			const input = await resolve_ai_input(text, command_options)
			const payload = build_ai_note_payload(input)

			if (options.dryRun) {
				print_success(options, {
					action: 'ai.note',
					route: payload.route,
					request: {
						method: 'POST',
						path: '/notes',
						payload: {
							content: payload.content,
							tags: payload.tags,
						},
					},
				}, { dryRun: true })
				return
			}

			const note = await client.createNote({
				content: payload.content,
				tags: payload.tags,
			})

			print_success(options, {
				action: 'create_note',
				noteId: note.id,
				link: `strata-note://${note.id}`,
				tags: note.tags,
				route: payload.route.route,
				routeDecision: payload.route,
			})
		})

	ai
		.command('bench')
		.description('Run lightweight AI CLI/API benchmark checks.')
		.action(async function () {
			const { options, client } = get_context(this)
			const result = await run_bench(client)
			print_success(options, result)
		})

	ai
		.command('eval-routing')
		.description('Run deterministic routing eval set against current routing rules.')
		.action(async function () {
			const { options } = get_context(this)
			const examples = await load_eval_examples()
			const failures: Array<Record<string, unknown>> = []

			for (const example of examples) {
				const decision = build_route_decision(example.input)
				const matches =
					decision.intent === example.expectedIntent &&
					decision.route === example.expectedRoute &&
					decision.risk === example.expectedRisk &&
					decision.requiresConfirmation === example.requiresConfirmation
				if (!matches) {
					failures.push({
						id: example.id,
						input: example.input,
						expected: {
							intent: example.expectedIntent,
							route: example.expectedRoute,
							risk: example.expectedRisk,
							requiresConfirmation: example.requiresConfirmation,
						},
						actual: decision,
					})
				}
			}

			const summary = {
				total: examples.length,
				passed: examples.length - failures.length,
				failed: failures.length,
				failures,
			}

			print_success(options, summary)

			if (failures.length > 0 && options.failOnWarning) {
				throw new CliError({
					message: 'Routing eval detected failures and --fail-on-warning was set.',
					exitCode: ExitCode.PartialFailure,
					code: 'ROUTING_EVAL_FAILED',
					details: summary,
				})
			}
		})
}
