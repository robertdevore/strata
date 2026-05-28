import { describe, expect, it } from 'vitest'
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
