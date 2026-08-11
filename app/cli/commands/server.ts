import { Command } from 'commander'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CliRuntimeOptions } from '../types'

interface RuntimeContext {
	options: CliRuntimeOptions
}

export const resolve_server_bind_environment = (base_url: string): { STRATA_API_HOST: string; STRATA_API_PORT: string } => {
	const parsed = new URL(base_url)
	if ('http:' !== parsed.protocol) throw new Error('The standalone server requires an http:// base URL.')
	if (parsed.pathname && '/' !== parsed.pathname) throw new Error('The standalone server base URL cannot include a path.')
	return {
		STRATA_API_HOST: parsed.hostname,
		STRATA_API_PORT: parsed.port || '80',
	}
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const electron_binary_path = path.resolve(__dirname, '../../../node_modules/.bin/electron')
const standalone_server_entry = path.resolve(__dirname, '../../standalone/server.cjs')

export const register_server_command = (
	program: Command,
	get_context: (command: Command) => RuntimeContext,
): void => {
	program
		.command('server')
		.description('Run the local Strata HTTP API without opening the desktop app.')
		.option(
			'--user-data-dir <path>',
			'User data directory containing Strata data (default: desktop app location)',
		)
		.action(async function () {
			const { options } = get_context(this)
			const command_options = this.optsWithGlobals() as Record<string, unknown>
			const bind_environment = resolve_server_bind_environment(options.baseUrl)
			const child = spawn(electron_binary_path, [standalone_server_entry], {
				cwd: process.cwd(),
				stdio: 'inherit',
				env: {
					...process.env,
					...bind_environment,
					...(command_options.userDataDir
						? { STRATA_USER_DATA_DIR: String(command_options.userDataDir) }
						: {}),
				},
			})

			await new Promise<void>((resolve, reject) => {
				child.once('error', reject)
				child.once('exit', (code, signal) => {
					if (0 === code || 'SIGINT' === signal || 'SIGTERM' === signal) {
						resolve()
						return
					}
					reject(new Error(`Standalone Strata server exited with code ${code ?? 'null'}.`))
				})
			})
		})
}
