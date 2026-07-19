import { Command } from 'commander'
import { describe, expect, it, vi } from 'vitest'
import { register_agent_commands } from '../../../../cli/commands/agent'
import type { StrataApiClient } from '../../../../cli/lib/apiClient'
import { ensure_agent_destructive_allowed, ensure_confirm_or_dry_run } from '../../../../cli/lib/agentMode'
import { CliError } from '../../../../cli/lib/errors'
import type { CliRuntimeOptions } from '../../../../cli/types'

const base_options: CliRuntimeOptions = {
	baseUrl: 'http://127.0.0.1:3939',
	token: null,
	outputMode: 'json',
	quiet: false,
	verbose: false,
	dryRun: false,
	confirm: false,
	timeoutMs: 15000,
	agentMode: false,
	noColor: true,
	failOnWarning: false,
}

describe('cli agent safety guards', () => {
	it('requires confirm or dry-run for risky operations', () => {
		expect(() => ensure_confirm_or_dry_run(base_options, 'notes update')).toThrow(CliError)
		expect(() => ensure_confirm_or_dry_run({ ...base_options, dryRun: true }, 'notes update')).not.toThrow()
		expect(() => ensure_confirm_or_dry_run({ ...base_options, confirm: true }, 'notes update')).not.toThrow()
	})

	it('blocks destructive actions in agent mode without allow flag', () => {
		expect(() => ensure_agent_destructive_allowed({ ...base_options, agentMode: true }, false, 'notes delete')).toThrow(CliError)
		expect(() => ensure_agent_destructive_allowed({ ...base_options, agentMode: true }, true, 'notes delete')).not.toThrow()
	})
})

describe('cli agent context search', () => {
	const note = {
		id: '00000000-0000-0000-0000-000000000001',
		content: '# Durable title\n\nA compact body that should become the snippet.',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-02T00:00:00.000Z',
		starred: false,
		archived: false,
		tags: ['memory'],
		projectId: null,
		deletedAt: null,
	}

	it('passes the intended query and limit and returns compact results by default', async () => {
		const search_notes = vi.fn().mockResolvedValue([note])
		const client = { searchNotes: search_notes } as unknown as StrataApiClient
		const program = new Command().exitOverride()
		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
		register_agent_commands(program, () => ({ options: { ...base_options, outputMode: 'json' }, client }))

		await program.parseAsync(['node', 'strata', 'agent', 'context', 'search', 'needle', '--limit', '2'])

		expect(search_notes).toHaveBeenCalledWith('needle', 2)
		const output = JSON.parse(String(write.mock.calls.at(-1)?.[0]))
		expect(output.data.compact).toBe(true)
		expect(output.data.notes[0]).toMatchObject({
			id: note.id,
			title: 'Durable title',
			snippet: 'A compact body that should become the snippet.',
		})
		expect(output.data.notes[0]).not.toHaveProperty('content')
		write.mockRestore()
	})

	it('returns complete note records only when --full is explicit', async () => {
		const client = { searchNotes: vi.fn().mockResolvedValue([note]) } as unknown as StrataApiClient
		const program = new Command().exitOverride()
		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
		register_agent_commands(program, () => ({ options: { ...base_options, outputMode: 'json' }, client }))

		await program.parseAsync(['node', 'strata', 'agent', 'context', 'search', 'needle', '--full'])

		const output = JSON.parse(String(write.mock.calls.at(-1)?.[0]))
		expect(output.data.compact).toBe(false)
		expect(output.data.notes[0].content).toBe(note.content)
		write.mockRestore()
	})
})
