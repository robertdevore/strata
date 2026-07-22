import { Command } from 'commander'
import { resolve_runtime_options } from './lib/config'
import { StrataApiClient } from './lib/apiClient'
import { CliError, get_exit_code, print_error } from './lib/errors'
import { ExitCode } from './types'
import { register_health_command } from './commands/health'
import { register_config_commands } from './commands/config'
import { register_notes_commands } from './commands/notes'
import { register_search_command } from './commands/search'
import { register_projects_commands } from './commands/projects'
import { register_tags_commands } from './commands/tags'
import { register_tasks_commands } from './commands/tasks'
import { register_ai_commands } from './commands/ai'
import { register_agent_commands } from './commands/agent'
import { register_server_command } from './commands/server'

const program = new Command()

program
	.name('strata')
	.description('Enterprise-grade Strata CLI (HTTP API only, no direct SQLite writes).')
	.option('--base-url <url>', 'Strata API base URL (default: http://127.0.0.1:3939)')
	.option('--token <token>', 'Strata API token (never printed)')
	.option('--json', 'Machine-readable JSON output')
	.option('--pretty', 'Human-readable output')
	.option('--quiet', 'Suppress non-essential output')
	.option('--verbose', 'Verbose diagnostics output')
	.option('--dry-run', 'Validate and preview request without mutations')
	.option('--confirm', 'Confirm mutating operation')
	.option('--timeout <ms>', 'HTTP timeout in milliseconds')
	.option('--agent', 'Enable agent-safe mode')
	.option('--no-color', 'Disable colored output')
	.option('--fail-on-warning', 'Exit non-zero when warnings are present')
	.showHelpAfterError()
	.exitOverride()

const get_context = (command: Command) => {
	const global_options = command.optsWithGlobals() as Record<string, unknown>
	const options = resolve_runtime_options({
		baseUrl: global_options.baseUrl,
		token: global_options.token,
		json: global_options.json,
		pretty: global_options.pretty,
		quiet: global_options.quiet,
		verbose: global_options.verbose,
		dryRun: global_options.dryRun,
		confirm: global_options.confirm,
		timeout: global_options.timeout,
		agent: global_options.agent,
		noColor: false === global_options.color,
		failOnWarning: global_options.failOnWarning,
	})

	const client = new StrataApiClient({
		baseUrl: options.baseUrl,
		token: options.token,
		timeoutMs: options.timeoutMs,
		verbose: options.verbose,
	})

	return { options, client }
}

register_health_command(program, get_context)
register_config_commands(program, get_context)
register_notes_commands(program, get_context)
register_search_command(program, get_context)
register_projects_commands(program, get_context)
register_tags_commands(program, get_context)
register_tasks_commands(program, get_context)
register_ai_commands(program, get_context)
register_agent_commands(program, get_context)
register_server_command(program, get_context)

const run = async (): Promise<void> => {
	try {
		await program.parseAsync(process.argv)
	} catch (error) {
		const fallback_options = resolve_runtime_options({})
		const error_message = error instanceof Error ? error.message : String(error)
		if (error && 'object' === typeof error && 'code' in error && 'commander.helpDisplayed' === (error as { code?: string }).code) {
			process.exit(ExitCode.Success)
			return
		}

		if (error && 'object' === typeof error && 'code' in error && 'commander.unknownOption' === (error as { code?: string }).code) {
			print_error(new CliError({
				message: error_message,
				exitCode: ExitCode.ValidationError,
				code: 'UNKNOWN_OPTION',
			}), fallback_options)
			process.exit(ExitCode.ValidationError)
			return
		}

		if (error && 'object' === typeof error && 'code' in error && 'commander.missingArgument' === (error as { code?: string }).code) {
			print_error(new CliError({
				message: error_message,
				exitCode: ExitCode.ValidationError,
				code: 'MISSING_ARGUMENT',
			}), fallback_options)
			process.exit(ExitCode.ValidationError)
			return
		}

		print_error(error, fallback_options)
		process.exit(get_exit_code(error))
	}
}

void run()
