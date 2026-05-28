import { Command } from 'commander'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { print_success } from '../lib/output'
import { is_local_base_url } from '../lib/config'
import { CliError } from '../lib/errors'
import { ExitCode, type CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'

interface RuntimeContext {
	options: CliRuntimeOptions
	client: StrataApiClient
}

const find_repo_root = async (start_dir: string): Promise<string | null> => {
	let current_dir = start_dir
	for (;;) {
		const package_json_path = path.join(current_dir, 'package.json')
		try {
			await fs.access(package_json_path)
			return current_dir
		} catch {
			// keep walking up
		}
		const parent = path.dirname(current_dir)
		if (parent === current_dir) return null
		current_dir = parent
	}
}

const read_package_scripts = async (root_dir: string): Promise<Record<string, string>> => {
	const raw = await fs.readFile(path.join(root_dir, 'package.json'), 'utf-8')
	const parsed = JSON.parse(raw) as { scripts?: Record<string, string> }
	return parsed.scripts || {}
}

export const register_config_commands = (
	program: Command,
	get_context: (command: Command) => RuntimeContext,
): void => {
	const config = program.command('config').description('Show CLI config and diagnostics.')

	config
		.command('show')
		.description('Show resolved Strata CLI runtime config.')
		.action(async function () {
			const { options } = get_context(this)
			const data = {
				baseUrl: options.baseUrl,
				tokenPresent: Boolean(options.token),
				outputMode: options.outputMode,
				dryRunDefault: options.dryRun,
				agentMode: options.agentMode,
				timeoutMs: options.timeoutMs,
				failOnWarning: options.failOnWarning,
			}
			print_success(options, data)
		})

	config
		.command('doctor')
		.description('Check API connectivity and common local configuration issues.')
		.action(async function () {
			const { options, client } = get_context(this)
			const checks: Array<{ name: string; ok: boolean; detail: string }> = []
			const warnings: string[] = []

			let api_reachable = false
			try {
				await client.health()
				api_reachable = true
				checks.push({ name: 'api_reachable', ok: true, detail: 'Strata API responded to /health.' })
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				checks.push({ name: 'api_reachable', ok: false, detail: message })
				warnings.push('Strata API is unreachable. Start the Strata desktop app first.')
			}

			if (!options.token) {
				checks.push({ name: 'auth_token', ok: true, detail: 'No token configured (valid when API token auth is disabled).' })
			} else {
				checks.push({ name: 'auth_token', ok: true, detail: 'Token configured (value hidden).' })
			}

			if (!is_local_base_url(options.baseUrl)) {
				warnings.push('Base URL is not localhost/127.0.0.1. Strata API should stay local-only.')
				checks.push({ name: 'local_base_url', ok: false, detail: options.baseUrl })
			} else {
				checks.push({ name: 'local_base_url', ok: true, detail: options.baseUrl })
			}

			const repo_root = await find_repo_root(process.cwd())
			if (!repo_root) {
				checks.push({ name: 'repo_context', ok: false, detail: 'Could not locate package.json from current directory.' })
				warnings.push('Run CLI from the Strata repository for full script checks.')
			} else {
				checks.push({ name: 'repo_context', ok: true, detail: repo_root })
				const scripts = await read_package_scripts(repo_root)
				const has_notes_api = 'string' === typeof scripts['notes:api']
				checks.push({
					name: 'notes_api_script',
					ok: has_notes_api,
					detail: has_notes_api ? 'notes:api script is present.' : 'notes:api script not found.',
				})
				if (!has_notes_api) {
					warnings.push('Legacy notes:api script missing. Existing automation may break.')
				}
			}

			const data = {
				ok: api_reachable,
				baseUrl: options.baseUrl,
				tokenPresent: Boolean(options.token),
				checks,
				warnings,
			}

			print_success(options, data)

			if (warnings.length > 0 && options.failOnWarning) {
				throw new CliError({
					message: 'Doctor found warnings and --fail-on-warning was set.',
					exitCode: ExitCode.PartialFailure,
					code: 'DOCTOR_WARNINGS',
					details: warnings,
				})
			}
		})
}
