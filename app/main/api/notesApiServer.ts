import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import type { StrataDatabase } from '../db'
import { ensureLocalCredential, isLoopbackHost, tokensEqual } from '../../shared/apiCredential'
import { DomainError } from '../../shared/errors'
import { KnowledgeService, idSchema, listSchema, revisionSchema } from '../services/knowledgeService'

const MAX_BODY = 1024 * 1024
interface Options {
  onNotesChanged?: () => void
  host?: string
  port?: number
  token?: string
}
const fail = (code: string, message: string, status = 400, details: Record<string, unknown> = {}) => ({
  status,
  body: { ok: false, error: { code, message, details } },
})
const body = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > MAX_BODY) throw new DomainError('PAYLOAD_TOO_LARGE', 'Request exceeds 1MB')
    chunks.push(bytes)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? JSON.parse(raw) : {}
}
const boolean = (value: string | null): boolean | undefined => {
  if (value === null) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  throw new DomainError('VALIDATION_ERROR', 'Expected true or false')
}
const write = (response: ServerResponse, status: number, payload: unknown) => {
  let text = JSON.stringify(payload)
  if (Buffer.byteLength(text) > 4 * 1024 * 1024) {
    status = 413
    text = JSON.stringify(fail('RESPONSE_TOO_LARGE', 'Use a smaller limit', 413).body)
  }
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Strata-API-Version': '1',
  })
  response.end(text)
}

export const startNotesApiServer = async (db: StrataDatabase, options: Options = {}) => {
  const host = options.host ?? process.env.STRATA_API_HOST ?? '127.0.0.1'
  if (!isLoopbackHost(host))
    throw new Error('Non-loopback API binding is disabled; use an authenticated tunnel for remote automation')
  const port = options.port ?? Number(process.env.STRATA_API_PORT ?? 3939)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid API port')
  const token = options.token ?? ensureLocalCredential()
  if (token.length < 32) throw new Error('API token must contain at least 32 characters')
  const service = new KnowledgeService(db, () => options.onNotesChanged?.())
  const handle = async (request: IncomingMessage) => {
    if (request.headers.origin || request.headers['sec-fetch-site'])
      return fail('ORIGIN_FORBIDDEN', 'Browser requests are not allowed', 403)
    const authorization = request.headers.authorization
    const supplied = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : request.headers['x-strata-token']
    if (!tokensEqual(typeof supplied === 'string' ? supplied : null, token))
      return fail('UNAUTHORIZED', 'Unauthorized', 401)
    if ((request.url?.length ?? 0) > 8192) return fail('URL_TOO_LONG', 'URL too long', 414)
    if (Number(request.headers['content-length'] ?? 0) > MAX_BODY)
      return fail('PAYLOAD_TOO_LARGE', 'Request exceeds 1MB', 413)
    const method = request.method ?? 'GET'
    if (
      ['POST', 'PUT', 'PATCH'].includes(method) &&
      !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')
    )
      return fail('UNSUPPORTED_MEDIA_TYPE', 'Expected application/json', 415)
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] === 'v1') parts.shift()
    const route = parts.join('/')
    const mutationOptions = {
      source: 'api',
      key:
        typeof request.headers['idempotency-key'] === 'string'
          ? request.headers['idempotency-key']
          : undefined,
    }
    const filters = () =>
      listSchema.parse({
        query: url.searchParams.get('query') ?? url.searchParams.get('q') ?? undefined,
        starred: boolean(url.searchParams.get('starred')),
        archived: boolean(url.searchParams.get('archived')),
        tag: url.searchParams.get('tag') ?? undefined,
        projectId: url.searchParams.get('projectId') ?? undefined,
        includeDeleted: boolean(url.searchParams.get('includeDeleted')),
        limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
        cursor: url.searchParams.get('cursor') ?? undefined,
      })
    const ok = (payload: unknown, status = 200) => ({ status, body: payload })
    if (method === 'GET' && route === 'health') return ok({ ok: true })
    if (method === 'GET' && route === 'capabilities')
      return ok({
        version: '0.8.0',
        apiVersion: 1,
        schemaVersion: 10,
        auth: 'local-token',
        search: 'fts5-with-substring-fallback',
        capabilities: [
          'summaries',
          'pagination',
          'revisions',
          'optimistic-concurrency',
          'history',
          'batch',
          'idempotency',
        ],
        limits: { list: 100, batch: 50, bodyBytes: MAX_BODY },
        mutation: { expectedRevision: 'required', dryRun: true, aiConfirmation: 'approval-required' },
        aiEnabled: Boolean(db.getSettings().openAiApiKey),
      })
    if (method === 'GET' && (route === 'notes' || route === 'search'))
      return ok(db.listSummaryPage(filters()))
    if (method === 'POST' && route === 'batch') return ok(service.batch(await body(request), mutationOptions))
    if (method === 'POST' && route === 'notes')
      return ok(
        { note: service.mutate({ op: 'create_note', payload: await body(request) }, mutationOptions) },
        201,
      )
    if (parts[0] === 'notes' && parts.length >= 2) {
      const id = idSchema.parse(parts[1])
      if (method === 'GET' && parts.length === 2) {
        const note = db.getNote(id)
        return note ? ok({ note }) : fail('NOT_FOUND', 'Note not found', 404)
      }
      if (['PATCH', 'PUT'].includes(method) && parts.length === 2) {
        const payload = z.record(z.string(), z.unknown()).parse(await body(request))
        if (request.headers['if-match'])
          payload.expectedRevision = Number(String(request.headers['if-match']).replace(/^"|"$/g, ''))
        return ok({ note: service.mutate({ op: 'update_note', id, payload }, mutationOptions) })
      }
      if (method === 'DELETE' && parts.length === 2)
        return ok(
          service.mutate(
            {
              op: 'delete_note',
              id,
              expectedRevision: Number(
                request.headers['if-match'] ?? url.searchParams.get('expectedRevision'),
              ),
            },
            mutationOptions,
          ),
        )
      if (method === 'GET' && parts[2] === 'history') return ok({ revisions: db.listRevisions(id) })
      if (method === 'POST' && parts[2] === 'restore') {
        const parsed = z
          .object({ revision: revisionSchema, expectedRevision: revisionSchema })
          .strict()
          .parse(await body(request))
        const note = db.restoreRevision(id, parsed.revision, parsed.expectedRevision)
        if (!note) return fail('NOT_FOUND', 'Note not found', 404)
        options.onNotesChanged?.()
        return ok({ note })
      }
      if (!db.getNote(id)) return fail('NOT_FOUND', 'Note not found', 404)
      if (method === 'GET' && parts[2] === 'backlinks')
        return ok({
          backlinks: db.getBacklinks(id).map((entry) => ({ ...entry, source: db.summarize(entry.source) })),
        })
      if (method === 'GET' && parts[2] === 'related')
        return ok({
          related: db.getRelatedNotes(id).map((entry) => ({ ...entry, note: db.summarize(entry.note) })),
        })
      if (method === 'GET' && parts[2] === 'ai-edits') return ok({ edits: db.listAiEdits(id) })
    }
    if (method === 'GET' && route === 'tags') return ok({ tags: db.listTags() })
    if (method === 'GET' && route === 'projects') return ok({ projects: db.listProjects() })
    if (method === 'POST' && route === 'projects') {
      const parsed = z
        .object({ name: z.string() })
        .strict()
        .parse(await body(request))
      return ok(
        { project: service.mutate({ op: 'create_project', name: parsed.name }, mutationOptions) },
        201,
      )
    }
    if (method === 'POST' && route === 'projects/reorder') {
      const parsed = z
        .object({ projectIds: z.array(idSchema).max(1000) })
        .strict()
        .parse(await body(request))
      const projects = db.reorderProjects(parsed.projectIds)
      options.onNotesChanged?.()
      return ok({ projects })
    }
    if (parts[0] === 'projects' && parts.length >= 2) {
      const id = idSchema.parse(parts[1])
      if (method === 'GET' && parts[2] === 'notes') {
        const project = db.getProject(id)
        return project
          ? ok({ project, ...db.listSummaryPage({ ...filters(), projectId: id }) })
          : fail('NOT_FOUND', 'Project not found', 404)
      }
      if (['PATCH', 'PUT'].includes(method) && parts.length === 2) {
        const parsed = z
          .object({ name: z.string() })
          .strict()
          .parse(await body(request))
        return ok({
          project: service.mutate({ op: 'rename_project', id, name: parsed.name }, mutationOptions),
        })
      }
      if (method === 'DELETE' && parts.length === 2)
        return ok(service.mutate({ op: 'delete_project', id }, mutationOptions))
    }
    if (method === 'POST' && parts[0] === 'ai-edits' && parts[2] === 'revert') {
      const reverted = db.revertAiEdit(idSchema.parse(parts[1]))
      if (reverted) options.onNotesChanged?.()
      return reverted ? ok({ reverted }) : fail('NOT_FOUND', 'Edit not found or already reverted', 404)
    }
    return fail('NOT_FOUND', 'Not found', 404)
  }
  const server = createServer(async (request, response) => {
    try {
      const result = await handle(request)
      write(response, result.status, result.body)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const result = fail('VALIDATION_ERROR', 'Validation failed', 400, {
          issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        })
        write(response, result.status, result.body)
        return
      }
      if (error instanceof SyntaxError) {
        const result = fail('INVALID_JSON', 'Invalid JSON body')
        write(response, result.status, result.body)
        return
      }
      if (error instanceof DomainError) {
        const status =
          error.code.includes('CONFLICT') || error.code === 'ALREADY_EXISTS'
            ? 409
            : error.code === 'NOT_FOUND'
              ? 404
              : error.code === 'PAYLOAD_TOO_LARGE'
                ? 413
                : 400
        write(response, status, fail(error.code, error.message, status, error.details).body)
        return
      }
      console.error('[strata-api] Request failed')
      write(response, 500, fail('INTERNAL_ERROR', 'Internal server error', 500).body)
    }
  })
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  server.keepAliveTimeout = 5000
  server.maxHeadersCount = 50
  server.setTimeout(15000, (socket) => socket.destroy())
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  const actualPort = address && typeof address === 'object' ? address.port : port
  return {
    port: actualPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeIdleConnections()
      }),
  }
}
