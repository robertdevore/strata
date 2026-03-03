import { createServer } from 'node:http'
import type { IncomingMessage, Server } from 'node:http'
import { z } from 'zod'
import type { NoteUpdatePatch } from '../../shared/types'
import type { StrataDatabase } from '../db/index'

const request_body_limit_bytes = 1024 * 1024
const default_api_port = 3939
const default_api_host = '127.0.0.1'

const list_schema = z.object({
	query: z.string().optional(),
	starred: z.boolean().optional(),
	archived: z.boolean().optional(),
	tag: z.string().optional(),
	includeDeleted: z.boolean().optional(),
})

const id_schema = z.object({ id: z.string().uuid() })

const create_schema = z
	.object({
		content: z.string().optional(),
		starred: z.boolean().optional(),
		archived: z.boolean().optional(),
		tags: z.array(z.string()).optional(),
	})
	.optional()

const update_patch_schema = z.object({
	content: z.string().optional(),
	starred: z.boolean().optional(),
	archived: z.boolean().optional(),
	tags: z.array(z.string()).optional(),
})

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

interface ApiServerInstance {
	close: () => Promise<void>
}

interface NotesApiServerOptions {
	onNotesChanged?: () => void
}

interface JsonResponse {
	status: number
	body?: unknown
}

const parse_boolean = (value: string | null): boolean | undefined => {
	if (null === value) return undefined
	if ('true' === value) return true
	if ('false' === value) return false
	return undefined
}

const get_request_body = async (request: IncomingMessage): Promise<unknown> => {
	const chunks: Buffer[] = []
	let received = 0

	for await (const chunk of request) {
		const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		received += data.length
		if (received > request_body_limit_bytes) {
			throw new Error('Request body exceeds 1MB limit')
		}
		chunks.push(data)
	}

	if (0 === chunks.length) return undefined
	const raw = Buffer.concat(chunks).toString('utf8').trim()
	if (!raw) return undefined
	return JSON.parse(raw) as unknown
}

const write_json = (response: import('node:http').ServerResponse, status: number, payload?: unknown): void => {
	const body = undefined === payload ? '' : JSON.stringify(payload)
	response.statusCode = status
	response.setHeader('Content-Type', 'application/json; charset=utf-8')
	response.setHeader('Access-Control-Allow-Origin', '*')
	response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
	response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
	response.end(body)
}

const parse_method = (method: string | undefined): HttpMethod | null => {
	if (!method) return null
	if ('GET' === method || 'POST' === method || 'PUT' === method || 'PATCH' === method || 'DELETE' === method || 'OPTIONS' === method) {
		return method
	}
	return null
}

const parse_update_patch = (body: unknown): NoteUpdatePatch => {
	return update_patch_schema.parse(body)
}

const resolve_api_token = (): string | null => {
	const token = process.env.STRATA_API_TOKEN
	if (!token) return null
	const trimmed = token.trim()
	return trimmed ? trimmed : null
}

const get_request_token = (request: IncomingMessage): string | null => {
	const direct_token = request.headers['x-strata-token']
	if ('string' === typeof direct_token && direct_token.trim()) {
		return direct_token.trim()
	}

	const authorization = request.headers.authorization
	if ('string' === typeof authorization && authorization.startsWith('Bearer ')) {
		const token = authorization.slice('Bearer '.length).trim()
		if (token) return token
	}

	return null
}

const create_handler = (db: StrataDatabase, api_token: string | null, options: NotesApiServerOptions) => {
	return async (request: IncomingMessage): Promise<JsonResponse> => {
		const method = parse_method(request.method)
		if (!method) {
			return { status: 405, body: { error: 'Method not allowed' } }
		}
		if ('OPTIONS' === method) {
			return { status: 204 }
		}

		if (api_token) {
			const request_token = get_request_token(request)
			if (request_token !== api_token) {
				return { status: 401, body: { error: 'Unauthorized' } }
			}
		}

		const request_url = new URL(request.url ?? '/', `http://${default_api_host}`)
		const parts = request_url.pathname.split('/').filter(Boolean)

		if ('GET' === method && 1 === parts.length && 'health' === parts[0]) {
			return { status: 200, body: { ok: true } }
		}

		if ('GET' === method && 1 === parts.length && 'notes' === parts[0]) {
			const filters = list_schema.parse({
				query: request_url.searchParams.get('query') ?? undefined,
				starred: parse_boolean(request_url.searchParams.get('starred')),
				archived: parse_boolean(request_url.searchParams.get('archived')),
				tag: request_url.searchParams.get('tag') ?? undefined,
				includeDeleted: parse_boolean(request_url.searchParams.get('includeDeleted')),
			})
			return { status: 200, body: { notes: db.listNotes(filters) } }
		}

		if ('GET' === method && 2 === parts.length && 'notes' === parts[0]) {
			const { id } = id_schema.parse({ id: parts[1] })
			const note = db.getNote(id)
			if (!note) {
				return { status: 404, body: { error: 'Note not found' } }
			}
			return { status: 200, body: { note } }
		}

		if ('POST' === method && 1 === parts.length && 'notes' === parts[0]) {
			const body = await get_request_body(request)
			const parsed = create_schema.parse(body)
			const created = db.createNote()
			if (!parsed) {
				options.onNotesChanged?.()
				return { status: 201, body: { note: created } }
			}
			const updated = db.updateNote(created.id, parsed)
			options.onNotesChanged?.()
			return { status: 201, body: { note: updated ?? created } }
		}

		if (('PUT' === method || 'PATCH' === method) && 2 === parts.length && 'notes' === parts[0]) {
			const { id } = id_schema.parse({ id: parts[1] })
			const body = await get_request_body(request)
			const patch = parse_update_patch(body)
			const updated = db.updateNote(id, patch)
			if (!updated) {
				return { status: 404, body: { error: 'Note not found' } }
			}
			options.onNotesChanged?.()
			return { status: 200, body: { note: updated } }
		}

		if ('DELETE' === method && 2 === parts.length && 'notes' === parts[0]) {
			const { id } = id_schema.parse({ id: parts[1] })
			const deleted = db.deleteNote(id)
			if (!deleted) {
				return { status: 404, body: { error: 'Note not found' } }
			}
			options.onNotesChanged?.()
			return { status: 200, body: { deleted: true } }
		}

		return { status: 404, body: { error: 'Not found' } }
	}
}

const resolve_api_port = (): number => {
	const raw_port = process.env.STRATA_API_PORT
	if (!raw_port) return default_api_port
	const parsed = Number.parseInt(raw_port, 10)
	if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
		return default_api_port
	}
	return parsed
}

const resolve_api_host = (): string => {
	const host = process.env.STRATA_API_HOST
	if (!host) return default_api_host
	return host
}

const start_http_server = async (server: Server, port: number, host: string): Promise<void> => {
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, host, () => {
			server.off('error', reject)
			resolve()
		})
	})
}

export const startNotesApiServer = async (db: StrataDatabase, options: NotesApiServerOptions = {}): Promise<ApiServerInstance> => {
	const host = resolve_api_host()
	const port = resolve_api_port()
	const api_token = resolve_api_token()
	const handler = create_handler(db, api_token, options)

	const server = createServer(async (request, response) => {
		try {
			const result = await handler(request)
			write_json(response, result.status, result.body)
		} catch (error) {
			if (error instanceof z.ZodError) {
				write_json(response, 400, {
					error: 'Validation failed',
					details: error.issues,
				})
				return
			}

			if (error instanceof SyntaxError) {
				write_json(response, 400, { error: 'Invalid JSON body' })
				return
			}

			if (error instanceof Error && 'Request body exceeds 1MB limit' === error.message) {
				write_json(response, 413, { error: error.message })
				return
			}

			console.error('[strata-api] Request failed', error)
			write_json(response, 500, { error: 'Internal server error' })
		}
	})

	await start_http_server(server, port, host)
	if (api_token) {
		console.info(`[strata-api] Notes API listening at http://${host}:${port} (token auth enabled)`)
	} else {
		console.info(`[strata-api] Notes API listening at http://${host}:${port}`)
	}

	return {
		close: () => {
			return new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error)
						return
					}
					resolve()
				})
			})
		},
	}
}