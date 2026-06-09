import { createServer } from 'node:http'
import type { IncomingMessage, Server } from 'node:http'
import { z } from 'zod'
import type { NoteUpdatePatch } from '../../shared/types'
import type { StrataDatabase } from '../db/index'

const request_body_limit_bytes = 1024 * 1024
const default_api_port = 3939
const default_api_host = '127.0.0.1'

/** Derive title for related-notes computation (mirrors deriveNoteTitle). */
const derive_title = (content: string): string => {
	const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
	if (lines.length === 0) return 'Untitled'
	const h = lines.find((l) => l.startsWith('# '))
	if (h) return h.replace(/^#\s*/, '').trim() || 'Untitled'
	return lines[0].slice(0, 80)
}

const tokenize = (text: string): string[] =>
	text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2)

import type { Note } from '../../shared/types'

const computeRelated = (
	current_note: Note,
	all_notes: Note[],
	link_index: Array<{ sourceNoteId: string; targetNoteId: string | null; rawTarget: string }>,
): Array<{ note: Note; reason: string; score: number }> => {
	const scored = new Map<string, { note: Note; score: number; reasons: string[] }>()
	const ct = derive_title(current_note.content).toLowerCase()
	const cw = new Set(tokenize(ct + ' ' + current_note.content))
	const ctags = new Set(current_note.tags)
	const lf = new Set(link_index.filter((l) => l.sourceNoteId === current_note.id && l.targetNoteId).map((l) => l.targetNoteId!))
	const lt = new Set(link_index.filter((l) => l.targetNoteId === current_note.id).map((l) => l.sourceNoteId))
	const upsert = (note: Note, delta: number, reason: string) => {
		if (note.id === current_note.id || note.deletedAt) return
		const e = scored.get(note.id)
		if (e) { e.score += delta; if (!e.reasons.includes(reason)) e.reasons.push(reason) }
		else scored.set(note.id, { note, score: delta, reasons: [reason] })
	}
	for (const c of all_notes) {
		if (lf.has(c.id)) upsert(c, 50, 'Linked from this note')
		if (lt.has(c.id)) upsert(c, 50, 'Links here')
		const ct2 = new Set(c.tags); let st = 0
		for (const t of ctags) if (ct2.has(t)) st++
		if (st > 0) upsert(c, st * 10, `Shared tag${st > 1 ? 's' : ''}`)
		const cw2 = new Set(tokenize(derive_title(c.content).toLowerCase() + ' ' + c.content))
		let ov = 0
		for (const w of cw) { if (w.length < 3) continue; if (cw2.has(w)) ov++ }
		const ks = Math.min(50, ov * 2)
		if (ks > 0) upsert(c, ks, 'Similar text')
	}
	return [...scored.values()]
		.filter((e) => e.score >= 6)
		.sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt))
		.slice(0, 8)
		.map((e) => ({ note: e.note, reason: e.reasons.join(', '), score: e.score }))
}

const list_schema = z.object({
	query: z.string().optional(),
	starred: z.boolean().optional(),
	archived: z.boolean().optional(),
	tag: z.string().optional(),
	projectId: z.string().uuid().optional(),
	includeDeleted: z.boolean().optional(),
})

const id_schema = z.object({ id: z.string().uuid() })

const project_id_schema = z.object({ id: z.string().uuid() })

const create_schema = z
	.object({
		content: z.string().optional(),
		starred: z.boolean().optional(),
		archived: z.boolean().optional(),
		tags: z.array(z.string()).optional(),
		projectId: z.string().uuid().nullable().optional(),
		projectName: z.string().trim().min(1).max(120).optional(),
	})
	.optional()

const update_patch_schema = z.object({
	content: z.string().optional(),
	starred: z.boolean().optional(),
	archived: z.boolean().optional(),
	tags: z.array(z.string()).optional(),
	projectId: z.string().uuid().nullable().optional(),
	projectName: z.string().trim().min(1).max(120).optional(),
})

const project_create_schema = z.object({
	name: z.string().trim().min(1).max(120),
})

const project_update_schema = z.object({
	name: z.string().trim().min(1).max(120),
})

const project_reorder_schema = z.object({
	projectIds: z.array(z.string().uuid()).min(1),
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

const resolve_project_id = (
	db: StrataDatabase,
	payload: { projectId?: string | null; projectName?: string | null | undefined },
): { hasProjectId: boolean; projectId: string | null; valid: boolean } => {
	if (Object.prototype.hasOwnProperty.call(payload, 'projectId')) {
		if (null === payload.projectId) return { hasProjectId: true, projectId: null, valid: true }
		if ('string' === typeof payload.projectId) {
			const project = db.getProject(payload.projectId)
			return { hasProjectId: true, projectId: project?.id ?? null, valid: Boolean(project) }
		}
	}
	if ('string' === typeof payload.projectName && payload.projectName.trim()) {
		return { hasProjectId: true, projectId: db.createProject(payload.projectName).id, valid: true }
	}
	return { hasProjectId: false, projectId: null, valid: true }
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
				projectId: request_url.searchParams.get('projectId') ?? undefined,
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
			const project_resolution = parsed ? resolve_project_id(db, parsed) : { hasProjectId: false, projectId: null, valid: true }
			if (project_resolution.hasProjectId && !project_resolution.valid) {
				return { status: 404, body: { error: 'Project not found' } }
			}
			const created = db.createNote({
				content: parsed?.content,
				starred: parsed?.starred,
				archived: parsed?.archived,
				tags: parsed?.tags,
				projectId: project_resolution.hasProjectId ? project_resolution.projectId : null,
			})
			options.onNotesChanged?.()
			return { status: 201, body: { note: created } }
		}

		if (('PUT' === method || 'PATCH' === method) && 2 === parts.length && 'notes' === parts[0]) {
			const { id } = id_schema.parse({ id: parts[1] })
			const body = await get_request_body(request)
			const patch = parse_update_patch(body)
			const project_resolution = resolve_project_id(db, patch)
			if (project_resolution.hasProjectId && !project_resolution.valid) {
				return { status: 404, body: { error: 'Project not found' } }
			}
			const update_patch: NoteUpdatePatch = { ...patch }
			if (project_resolution.hasProjectId) {
				update_patch.projectId = project_resolution.projectId
			}
			const updated = db.updateNote(id, update_patch)
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

		// ---- Tags ----
		if ('GET' === method && 1 === parts.length && 'tags' === parts[0]) {
			return { status: 200, body: { tags: db.listTags() } }
		}

		// ---- Projects ----
		if ('GET' === method && 1 === parts.length && 'projects' === parts[0]) {
			return { status: 200, body: { projects: db.listProjects() } }
		}

		if ('POST' === method && 1 === parts.length && 'projects' === parts[0]) {
			const body = await get_request_body(request)
			const parsed = project_create_schema.parse(body)
			const project = db.createProject(parsed.name)
			options.onNotesChanged?.()
			return { status: 201, body: { project } }
		}

		if ('POST' === method && 2 === parts.length && 'projects' === parts[0] && 'reorder' === parts[1]) {
			const body = await get_request_body(request)
			const parsed = project_reorder_schema.parse(body)
			const projects = db.reorderProjects(parsed.projectIds)
			options.onNotesChanged?.()
			return { status: 200, body: { projects } }
		}

		if (('PUT' === method || 'PATCH' === method) && 2 === parts.length && 'projects' === parts[0]) {
			const { id } = project_id_schema.parse({ id: parts[1] })
			const body = await get_request_body(request)
			const parsed = project_update_schema.parse(body)
			const project = db.renameProject(id, parsed.name)
			if (!project) {
				return { status: 404, body: { error: 'Project not found' } }
			}
			options.onNotesChanged?.()
			return { status: 200, body: { project } }
		}

		if ('DELETE' === method && 2 === parts.length && 'projects' === parts[0]) {
			const { id } = project_id_schema.parse({ id: parts[1] })
			const deleted = db.deleteProject(id)
			if (!deleted) {
				return { status: 404, body: { error: 'Project not found' } }
			}
			options.onNotesChanged?.()
			return { status: 200, body: { deleted: true } }
		}

		if ('GET' === method && 3 === parts.length && 'projects' === parts[0] && 'notes' === parts[2]) {
			const { id } = project_id_schema.parse({ id: parts[1] })
			const project = db.getProject(id)
			if (!project) return { status: 404, body: { error: 'Project not found' } }
			return { status: 200, body: { project, notes: db.listNotes({ projectId: id, includeDeleted: false }) } }
		}

		// ---- Search ----
		if ('GET' === method && 1 === parts.length && 'search' === parts[0]) {
			const query = request_url.searchParams.get('q') ?? ''
			const limit_str = request_url.searchParams.get('limit')
			const limit = limit_str ? Math.min(100, Math.max(1, Number(limit_str) || 25)) : 25
			if (!query.trim()) return { status: 200, body: { notes: [] } }
			return { status: 200, body: { notes: db.aiSearchNotes(query, limit) } }
		}

		// ---- Backlinks ----
		if ('GET' === method && 3 === parts.length && 'notes' === parts[0] && 'backlinks' === parts[2]) {
			const { id } = id_schema.parse({ id: parts[1] })
			const note = db.getNote(id)
			if (!note) return { status: 404, body: { error: 'Note not found' } }
			return { status: 200, body: { backlinks: db.getBacklinks(id) } }
		}

		// ---- Related Notes ----
		if ('GET' === method && 3 === parts.length && 'notes' === parts[0] && 'related' === parts[2]) {
			const { id } = id_schema.parse({ id: parts[1] })
			const note = db.getNote(id)
			if (!note) return { status: 404, body: { error: 'Note not found' } }
			const all_notes = db.listNotes({ includeDeleted: false })
			const link_index = db.getAllLinks()
			// Use the same algorithm as the IPC handler
			const related = computeRelated(note, all_notes, link_index)
			return { status: 200, body: { related } }
		}

		// ---- AI Edit History ----
		if ('GET' === method && 3 === parts.length && 'notes' === parts[0] && 'ai-edits' === parts[2]) {
			const { id } = id_schema.parse({ id: parts[1] })
			return { status: 200, body: { edits: db.listAiEdits(id) } }
		}

		// ---- AI Edit Revert ----
		if ('POST' === method && 3 === parts.length && 'ai-edits' === parts[0] && 'revert' === parts[2]) {
			const { id } = id_schema.parse({ id: parts[1] })
			const reverted = db.revertAiEdit(id)
			if (!reverted) return { status: 404, body: { error: 'Edit not found or already reverted' } }
			options.onNotesChanged?.()
			return { status: 200, body: { reverted: true } }
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
