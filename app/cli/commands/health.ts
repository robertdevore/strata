import { Command } from 'commander'
import { performance } from 'node:perf_hooks'
import { print_success } from '../lib/output'
import type { CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'

interface RuntimeContext {
	options: CliRuntimeOptions
	client: StrataApiClient
}

export const register_health_command = (
	program: Command,
	get_context: (command: Command) => RuntimeContext,
): void => {
	program
		.command('health')
		.description('Check local Strata API health.')
		.action(async function () {
			const { options, client } = get_context(this)
			const started_at = performance.now()
			const response = await client.health()
			const latency_ms = Math.round(performance.now() - started_at)
			const data = {
				ok: response.ok,
				baseUrl: options.baseUrl,
				authenticated: Boolean(options.token),
				latencyMs: latency_ms,
			}

			print_success(options, data, {
				prettyText: `OK  ${data.baseUrl}  latency=${data.latencyMs}ms  auth=${data.authenticated ? 'enabled' : 'disabled'}`,
			})
		})
}
