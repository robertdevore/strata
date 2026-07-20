#!/usr/bin/env node

import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

const bridgeHost = process.env.STRATA_BRIDGE_HOST || '127.0.0.1'
const bridgePort = Number.parseInt(process.env.STRATA_BRIDGE_PORT || '7331', 10)
const strataBaseUrl = process.env.STRATA_API_BASE_URL || 'http://127.0.0.1:3939'
const strataToken = process.env.STRATA_API_TOKEN || ''
const requestBodyLimitBytes = 1024 * 1024

const isUuid = (value) =>
	typeof value === 'string' &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const readJsonBody = async (request) => {
	const chunks = []
	let received = 0
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		received += buffer.length
		if (received > requestBodyLimitBytes) {
			const error = new Error('Request body exceeds 1MB limit')
			error.status = 413
			throw error
		}
		chunks.push(buffer)
	}
	const raw = Buffer.concat(chunks).toString('utf8').trim()
	return raw ? JSON.parse(raw) : {}
}

const writeJson = (response, status, body) => {
	const payload = body === undefined ? '' : JSON.stringify(body)
	response.statusCode = status
	response.setHeader('Content-Type', 'application/json; charset=utf-8')
	response.setHeader('Access-Control-Allow-Origin', '*')
	response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
	response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Strata-Token,Authorization')
	response.end(payload)
}

const strataFetch = async (path, options = {}) => {
	const url = new URL(path, strataBaseUrl)
	const transport = url.protocol === 'https:' ? httpsRequest : httpRequest
	const body = options.body === undefined ? undefined : JSON.stringify(options.body)
	const headers = {
		Accept: 'application/json',
		...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
		...(strataToken ? { 'X-Strata-Token': strataToken } : {}),
	}

	return await new Promise((resolve, reject) => {
		const req = transport(
			url,
			{
				method: options.method || 'GET',
				headers,
			},
			(res) => {
				const chunks = []
				res.on('data', (chunk) => chunks.push(chunk))
				res.on('end', () => {
					const raw = Buffer.concat(chunks).toString('utf8')
					let json = null
					try {
						json = raw ? JSON.parse(raw) : null
					} catch {
						json = { raw }
					}
					resolve({ status: res.statusCode || 500, body: json })
				})
			},
		)
		req.on('error', reject)
		if (body) req.write(body)
		req.end()
	})
}

const stringField = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')

const pickExternalId = (payload) =>
	stringField(payload.externalId) ||
	stringField(payload.external_id) ||
	stringField(payload.taskId) ||
	stringField(payload.task_id) ||
	stringField(payload.issueId) ||
	stringField(payload.issue_id) ||
	stringField(payload.id) ||
	stringField(payload.url)

const buildContent = (payload, externalId) => {
	const explicitContent =
		stringField(payload.content) ||
		stringField(payload.markdown) ||
		stringField(payload.note) ||
		stringField(payload.body) ||
		stringField(payload.text)
	if (explicitContent) {
		return externalId && !explicitContent.includes(`strata-external-id: ${externalId}`)
			? `${explicitContent}\n\n<!-- strata-external-id: ${externalId} -->`
			: explicitContent
	}

	const title = stringField(payload.title) || stringField(payload.name) || 'Paperclip task'
	const lines = [`# ${title}`]
	const url = stringField(payload.url)
	const status = stringField(payload.status)
	const summary = stringField(payload.summary) || stringField(payload.description)
	if (url) lines.push('', url)
	if (status) lines.push('', `Status: ${status}`)
	if (summary) lines.push('', summary)
	if (externalId) lines.push('', `<!-- strata-external-id: ${externalId} -->`)
	return lines.join('\n')
}

const normalizeTags = (payload) => {
	const tags = Array.isArray(payload.tags) ? payload.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim()) : []
	for (const tag of ['paperclip', 'chrome-extension']) {
		if (!tags.includes(tag)) tags.push(tag)
	}
	return tags
}

const findExistingNoteByExternalId = async (externalId) => {
	if (!externalId) return null
	const query = encodeURIComponent(`strata-external-id: ${externalId}`)
	const result = await strataFetch(`/notes?query=${query}&includeDeleted=false`)
	if (result.status < 200 || result.status >= 300 || !Array.isArray(result.body?.notes)) return null
	return result.body.notes[0] || null
}

const upsertNote = async (payload) => {
	const externalId = pickExternalId(payload)
	const content = buildContent(payload, externalId)
	const tags = normalizeTags(payload)
	const projectName = stringField(payload.projectName) || stringField(payload.project) || undefined
	const starred = typeof payload.starred === 'boolean' ? payload.starred : undefined
	const archived = typeof payload.archived === 'boolean' ? payload.archived : undefined
	const patch = {
		content,
		tags,
		...(projectName ? { projectName } : {}),
		...(starred !== undefined ? { starred } : {}),
		...(archived !== undefined ? { archived } : {}),
	}

	const directId = isUuid(payload.noteId) ? payload.noteId : isUuid(payload.note_id) ? payload.note_id : isUuid(payload.id) ? payload.id : ''
	const existing = directId ? { id: directId } : await findExistingNoteByExternalId(externalId)

	if (existing?.id) {
		const updated = await strataFetch(`/notes/${existing.id}`, { method: 'PATCH', body: patch })
		if (updated.status !== 404) return updated
	}

	return await strataFetch('/notes', { method: 'POST', body: patch })
}

const server = createServer(async (request, response) => {
	try {
		if (request.method === 'OPTIONS') {
			writeJson(response, 204)
			return
		}

		const url = new URL(request.url || '/', `http://${bridgeHost}`)
		if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
			const health = await strataFetch('/health')
			writeJson(response, health.status, {
				ok: health.status >= 200 && health.status < 300,
				bridge: true,
				strata: health.body,
			})
			return
		}

		if (request.method === 'POST' && url.pathname === '/api/notes/upsert') {
			const payload = await readJsonBody(request)
			const result = await upsertNote(payload)
			writeJson(response, result.status, result.body)
			return
		}

		writeJson(response, 404, { error: 'Not found' })
	} catch (error) {
		if (error instanceof SyntaxError) {
			writeJson(response, 400, { error: 'Invalid JSON body' })
			return
		}
		writeJson(response, error.status || 502, {
			error: error instanceof Error ? error.message : 'Bridge request failed',
		})
	}
})

server.listen(bridgePort, bridgeHost, () => {
	console.log(`[strata-bridge] Listening at http://${bridgeHost}:${bridgePort}`)
	console.log(`[strata-bridge] Forwarding to ${strataBaseUrl}`)
})
