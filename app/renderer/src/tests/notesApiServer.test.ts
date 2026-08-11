import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { startNotesApiServer } from '@main/api/notesApiServer'

const cleanups: Array<() => Promise<void> | void> = []

afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()?.()
})

const start_test_server = async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-api-test-'))
	const db = new StrataDatabase(directory)
	const server = await startNotesApiServer(db, { host: '127.0.0.1', port: 0 })
	cleanups.push(async () => {
		await server.close()
		db.close()
		fs.rmSync(directory, { recursive: true, force: true })
	})
	return { db, baseUrl: `http://127.0.0.1:${server.port}` }
}

describe('notes API validation', () => {
	it('rejects malformed boolean filters instead of silently dropping them', async () => {
		const { baseUrl } = await start_test_server()
		const response = await fetch(`${baseUrl}/notes?starred=definitely`)

		expect(response.status).toBe(400)
		expect(await response.json()).toMatchObject({ error: 'Validation failed' })
	})

	it('returns 404 when AI edit history is requested for a missing note', async () => {
		const { baseUrl } = await start_test_server()
		const response = await fetch(`${baseUrl}/notes/00000000-0000-4000-8000-000000000000/ai-edits`)

		expect(response.status).toBe(404)
		expect(await response.json()).toEqual({ error: 'Note not found' })
	})
})
