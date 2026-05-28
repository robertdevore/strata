import { z } from 'zod'
import { CliError, map_http_status_to_exit_code } from './errors'
import { ExitCode } from '../types'
import {
	delete_response_schema,
	health_response_schema,
	note_list_response_schema,
	note_response_schema,
	note_schema,
	tag_stats_response_schema,
} from './validators'

const json_record_schema = z.record(z.string(), z.unknown())

const safe_get_json = async (response: Response): Promise<unknown> => {
	const text = await response.text().catch(() => '')
	if (!text.trim()) return null
	try {
		return JSON.parse(text) as unknown
	} catch {
		return { raw: text }
	}
}

const sleep = async (milliseconds: number): Promise<void> => {
	await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const normalize_base_url = (base_url: string): string => {
	const trimmed = base_url.trim().replace(/\/+$/, '')
	try {
		const parsed = new URL(trimmed)
		return `${parsed.protocol}//${parsed.host}`
	} catch {
		throw new CliError({
			message: `Invalid API base URL: ${base_url}`,
			exitCode: ExitCode.ValidationError,
			code: 'INVALID_BASE_URL',
		})
	}
}

export interface ApiClientOptions {
	baseUrl: string
	token: string | null
	timeoutMs: number
	verbose?: boolean
}

export interface RequestOptions {
	query?: Record<string, string | number | boolean | undefined>
	body?: unknown
	validate?: z.ZodTypeAny
	allowRetry?: boolean
}

export class StrataApiClient {
	private readonly baseUrl: string
	private readonly token: string | null
	private readonly timeoutMs: number
	private readonly verbose: boolean

	constructor(options: ApiClientOptions) {
		this.baseUrl = normalize_base_url(options.baseUrl)
		this.token = options.token
		this.timeoutMs = options.timeoutMs
		this.verbose = Boolean(options.verbose)
	}

	private build_headers(): Headers {
		const headers = new Headers()
		headers.set('Content-Type', 'application/json')
		if (this.token) {
			headers.set('X-Strata-Token', this.token)
			headers.set('Authorization', `Bearer ${this.token}`)
		}
		return headers
	}

	private build_url(path: string, query?: Record<string, string | number | boolean | undefined>): string {
		const url = new URL(`${this.baseUrl}${path}`)
		if (query) {
			for (const [key, value] of Object.entries(query)) {
				if (undefined === value) continue
				url.searchParams.set(key, String(value))
			}
		}
		return url.toString()
	}

	private async request<TResponse>(
		method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
		path: string,
		options: RequestOptions = {},
	): Promise<TResponse> {
		const url = this.build_url(path, options.query)
		const headers = this.build_headers()
		const allow_retry = Boolean(options.allowRetry && 'GET' === method)
		const max_attempts = allow_retry ? 3 : 1
		let attempt = 0
		let last_error: unknown = null

		while (attempt < max_attempts) {
			attempt += 1
			const controller = new AbortController()
			const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

			try {
				if (this.verbose) {
					process.stderr.write(`[strata-cli] ${method} ${url} (attempt ${attempt})\n`)
				}

				const response = await fetch(url, {
					method,
					headers,
					body: undefined === options.body ? undefined : JSON.stringify(options.body),
					signal: controller.signal,
				})
				clearTimeout(timeout)

				if (!response.ok) {
					const error_body = await safe_get_json(response)
					if (allow_retry && (response.status >= 500 || 429 === response.status) && attempt < max_attempts) {
						await sleep(120 * attempt)
						continue
					}

					throw new CliError({
						message: `Strata API request failed (${response.status})`,
						exitCode: map_http_status_to_exit_code(response.status),
						code: 'STRATA_API_ERROR',
						hint: 401 === response.status
							? 'Set STRATA_API_TOKEN or pass --token.'
							: 404 === response.status
								? 'Requested resource was not found.'
								: 'Ensure Strata is running and API URL is correct.',
						details: error_body,
					})
				}

				const raw = await safe_get_json(response)
				if (!options.validate) return raw as TResponse
				return options.validate.parse(raw) as TResponse
			} catch (error) {
				clearTimeout(timeout)
				last_error = error
				if (error instanceof CliError) throw error

				if (error instanceof DOMException && 'AbortError' === error.name) {
					throw new CliError({
						message: `Request timed out after ${this.timeoutMs}ms.`,
						exitCode: ExitCode.Timeout,
						code: 'REQUEST_TIMEOUT',
					})
				}

				if (allow_retry && attempt < max_attempts) {
					await sleep(120 * attempt)
					continue
				}

				throw new CliError({
					message: `Could not reach Strata API at ${this.baseUrl}`,
					exitCode: ExitCode.ApiUnavailable,
					code: 'STRATA_API_UNAVAILABLE',
					hint: 'Start Strata, then try again.',
					details: error instanceof Error ? error.message : String(error),
				})
			}
		}

		throw new CliError({
			message: 'Request failed unexpectedly.',
			exitCode: ExitCode.GenericFailure,
			code: 'REQUEST_FAILED',
			details: last_error,
		})
	}

	async health(): Promise<{ ok: boolean }> {
		return await this.request<{ ok: boolean }>('GET', '/health', {
			validate: health_response_schema,
			allowRetry: true,
		})
	}

	async listNotes(filters: {
		query?: string
		tag?: string
		starred?: boolean
		archived?: boolean
		includeDeleted?: boolean
	} = {}): Promise<Array<z.infer<typeof note_schema>>> {
		const response = await this.request<z.infer<typeof note_list_response_schema>>('GET', '/notes', {
			query: filters,
			validate: note_list_response_schema,
			allowRetry: true,
		})
		return response.notes
	}

	async searchNotes(query: string, limit?: number): Promise<Array<z.infer<typeof note_schema>>> {
		const response = await this.request<z.infer<typeof note_list_response_schema>>('GET', '/search', {
			query: {
				q: query,
				limit,
			},
			validate: note_list_response_schema,
			allowRetry: true,
		})
		return response.notes
	}

	async getNote(note_id: string): Promise<z.infer<typeof note_schema>> {
		const response = await this.request<z.infer<typeof note_response_schema>>('GET', `/notes/${note_id}`, {
			validate: note_response_schema,
			allowRetry: true,
		})
		return response.note
	}

	async createNote(payload: {
		content: string
		tags?: string[]
		starred?: boolean
		archived?: boolean
	}): Promise<z.infer<typeof note_schema>> {
		const response = await this.request<z.infer<typeof note_response_schema>>('POST', '/notes', {
			body: payload,
			validate: note_response_schema,
		})
		return response.note
	}

	async updateNote(note_id: string, payload: {
		content?: string
		tags?: string[]
		starred?: boolean
		archived?: boolean
	}): Promise<z.infer<typeof note_schema>> {
		const response = await this.request<z.infer<typeof note_response_schema>>('PATCH', `/notes/${note_id}`, {
			body: payload,
			validate: note_response_schema,
		})
		return response.note
	}

	async deleteNote(note_id: string): Promise<{ deleted: boolean }> {
		return await this.request<{ deleted: boolean }>('DELETE', `/notes/${note_id}`, {
			validate: delete_response_schema,
		})
	}

	async listTags(): Promise<Array<{ name: string; count: number }>> {
		const response = await this.request<z.infer<typeof tag_stats_response_schema>>('GET', '/tags', {
			validate: tag_stats_response_schema,
			allowRetry: true,
		})
		return response.tags
	}

	async listBacklinks(note_id: string): Promise<unknown[]> {
		const response = await this.request<{ backlinks: unknown[] }>('GET', `/notes/${note_id}/backlinks`, {
			validate: z.object({ backlinks: z.array(json_record_schema) }),
			allowRetry: true,
		})
		return response.backlinks
	}

	async listRelated(note_id: string): Promise<unknown[]> {
		const response = await this.request<{ related: unknown[] }>('GET', `/notes/${note_id}/related`, {
			validate: z.object({ related: z.array(json_record_schema) }),
			allowRetry: true,
		})
		return response.related
	}

	async listAiEdits(note_id: string): Promise<unknown[]> {
		const response = await this.request<{ edits: unknown[] }>('GET', `/notes/${note_id}/ai-edits`, {
			validate: z.object({ edits: z.array(json_record_schema) }),
			allowRetry: true,
		})
		return response.edits
	}
}
