import { afterEach, describe, expect, it } from 'vitest'
import { resolve_runtime_options } from '../../../../cli/lib/config'

describe('cli config resolver', () => {
	afterEach(() => {
		delete process.env.STRATA_API_BASE_URL
		delete process.env.STRATA_API_TOKEN
		delete process.env.STRATA_CLI_OUTPUT
		delete process.env.STRATA_CLI_DRY_RUN
		delete process.env.STRATA_CLI_AGENT_MODE
	})

	it('resolves defaults when flags/env are absent', () => {
		const options = resolve_runtime_options({})
		expect(options.baseUrl).toBe('http://127.0.0.1:3939')
		expect(options.token).toBeNull()
		expect(options.outputMode).toBe('pretty')
		expect(options.dryRun).toBe(false)
	})

	it('resolves token/base url from env safely', () => {
		process.env.STRATA_API_BASE_URL = 'http://127.0.0.1:3939/'
		process.env.STRATA_API_TOKEN = 'secret-token'
		const options = resolve_runtime_options({})
		expect(options.baseUrl).toBe('http://127.0.0.1:3939/')
		expect(options.token).toBe('secret-token')
	})

	it('defaults to json output in agent mode', () => {
		process.env.STRATA_CLI_AGENT_MODE = 'true'
		const options = resolve_runtime_options({})
		expect(options.agentMode).toBe(true)
		expect(options.outputMode).toBe('json')
	})
})
