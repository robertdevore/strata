import { z } from 'zod'
import type { CliRuntimeOptions, OutputMode } from '../types'

const default_base_url = 'http://127.0.0.1:3939'
const default_timeout_ms = 15000

const env_bool_schema = z.enum(['true', 'false']).transform((value) => 'true' === value)

const runtime_options_schema = z.object({
	baseUrl: z.string().trim().min(1).optional(),
	token: z.string().trim().optional(),
	json: z.boolean().optional(),
	pretty: z.boolean().optional(),
	quiet: z.boolean().optional(),
	verbose: z.boolean().optional(),
	dryRun: z.boolean().optional(),
	confirm: z.boolean().optional(),
	timeout: z.string().optional(),
	agent: z.boolean().optional(),
	noColor: z.boolean().optional(),
	failOnWarning: z.boolean().optional(),
})

const parse_env_bool = (raw_value: string | undefined, fallback: boolean): boolean => {
	if (!raw_value) return fallback
	const parsed = env_bool_schema.safeParse(raw_value.trim().toLowerCase())
	if (!parsed.success) return fallback
	return parsed.data
}

const resolve_output_mode = (raw: { json?: boolean; pretty?: boolean; agent?: boolean }): OutputMode => {
	if (raw.json) return 'json'
	if (raw.pretty) return 'pretty'

	const env_mode = (process.env.STRATA_CLI_OUTPUT || '').trim().toLowerCase()
	if ('json' === env_mode) return 'json'
	if ('pretty' === env_mode) return 'pretty'

	if (raw.agent || parse_env_bool(process.env.STRATA_CLI_AGENT_MODE, false)) {
		return 'json'
	}

	return 'pretty'
}

export const resolve_runtime_options = (raw_input: unknown): CliRuntimeOptions => {
	const raw = runtime_options_schema.parse(raw_input)
	const timeout_from_flag = raw.timeout ? Number.parseInt(raw.timeout, 10) : Number.NaN
	const timeout_from_env = Number.parseInt(process.env.STRATA_CLI_TIMEOUT_MS || '', 10)
	const resolved_timeout = Number.isFinite(timeout_from_flag)
		? timeout_from_flag
		: Number.isFinite(timeout_from_env)
			? timeout_from_env
			: default_timeout_ms

	const token_from_env = (process.env.STRATA_API_TOKEN || '').trim()
	const token_from_flag = (raw.token || '').trim()
	const token = token_from_flag || token_from_env || null

	const base_url = (raw.baseUrl || process.env.STRATA_API_BASE_URL || default_base_url).trim()

	return {
		baseUrl: base_url,
		token,
		outputMode: resolve_output_mode(raw),
		quiet: Boolean(raw.quiet),
		verbose: Boolean(raw.verbose),
		dryRun: Boolean(raw.dryRun) || parse_env_bool(process.env.STRATA_CLI_DRY_RUN, false),
		confirm: Boolean(raw.confirm),
		timeoutMs: Math.max(500, resolved_timeout),
		agentMode: Boolean(raw.agent) || parse_env_bool(process.env.STRATA_CLI_AGENT_MODE, false),
		noColor: Boolean(raw.noColor),
		failOnWarning: Boolean(raw.failOnWarning),
	}
}

export const is_local_base_url = (base_url: string): boolean => {
	try {
		const parsed = new URL(base_url)
		return ['127.0.0.1', 'localhost'].includes(parsed.hostname)
	} catch {
		return false
	}
}
