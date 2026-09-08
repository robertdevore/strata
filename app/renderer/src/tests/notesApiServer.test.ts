import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Command } from 'commander'
import { StrataDatabase } from '@main/db'
import { startNotesApiServer } from '@main/api/notesApiServer'
import { register_agent_commands } from '../../../cli/commands/agent'
import { StrataApiClient } from '../../../cli/lib/apiClient'
import type { CliRuntimeOptions } from '../../../cli/types'

const testToken = 'strata-test-token-000000000000000000000000'
const authenticatedFetch: typeof fetch = (input, init) =>
  globalThis.fetch(input, { ...init, headers: { Authorization: `Bearer ${testToken}`, ...init?.headers } })

const cleanups: Array<() => Promise<void> | void> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

const start_test_server = async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-api-test-'))
  const db = new StrataDatabase(directory)
  const server = await startNotesApiServer(db, { host: '127.0.0.1', port: 0, token: testToken })
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
    const response = await authenticatedFetch(`${baseUrl}/notes?starred=definitely`)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('returns 404 when AI edit history is requested for a missing note', async () => {
    const { baseUrl } = await start_test_server()
    const response = await authenticatedFetch(
      `${baseUrl}/notes/00000000-0000-4000-8000-000000000000/ai-edits`,
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  it('keeps create-to-retrieval synchronous across API, agent context, and restart', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-retrieval-test-'))
    let db: StrataDatabase | null = new StrataDatabase(directory)
    let server: Awaited<ReturnType<typeof startNotesApiServer>> | null = await startNotesApiServer(db, {
      host: '127.0.0.1',
      port: 0,
      token: testToken,
    })
    const make_client = () =>
      new StrataApiClient({
        baseUrl: `http://127.0.0.1:${server!.port}`,
        token: testToken,
        timeoutMs: 2000,
      })
    const output_options: CliRuntimeOptions = {
      baseUrl: `http://127.0.0.1:${server.port}`,
      token: testToken,
      outputMode: 'json',
      quiet: false,
      verbose: false,
      dryRun: false,
      confirm: false,
      timeoutMs: 2000,
      agentMode: true,
      noColor: true,
      failOnWarning: false,
    }
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    try {
      let client = make_client()
      const unique_term = 'cobalt-albatross-7319'
      const note = await client.createNote({
        content: `# Retrieval contract\n\nDurable marker ${unique_term} records cache invalidation.`,
        tags: ['retrieval-contract'],
      })

      expect((await client.getNote(note.id)).id).toBe(note.id)
      expect((await client.searchNotes(unique_term)).map((candidate) => candidate.id)).toContain(note.id)
      expect(await client.searchNotes('evicting remembered bird concepts')).toEqual([])

      const program = new Command().exitOverride()
      register_agent_commands(program, () => ({ options: output_options, client }))
      await program.parseAsync(['node', 'strata', 'agent', 'context', 'search', unique_term, '--limit', '5'])
      const agent_output = JSON.parse(String(write.mock.calls.at(-1)?.[0]))
      expect(agent_output.data.notes.map((candidate: { id: string }) => candidate.id)).toContain(note.id)

      await server.close()
      server = null
      db.close()
      db = null

      db = new StrataDatabase(directory)
      server = await startNotesApiServer(db, { host: '127.0.0.1', port: 0, token: testToken })
      client = make_client()
      expect((await client.searchNotes(unique_term)).map((candidate) => candidate.id)).toContain(note.id)
    } finally {
      write.mockRestore()
      if (server) await server.close()
      db?.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
