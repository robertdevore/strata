import { Command } from 'commander'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CliRuntimeOptions } from '../types'

interface RuntimeContext {
	options: CliRuntimeOptions
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
			const child = spawn(electron_binary_path, [standalone_server_entry], {
				cwd: process.cwd(),
				stdio: 'inherit',
				env: {
					...process.env,
					STRATA_API_BASE_URL: options.baseUrl,
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
