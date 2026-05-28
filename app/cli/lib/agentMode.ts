import { CliError } from './errors'
import { ExitCode, type CliRuntimeOptions } from '../types'

export const ensure_confirm_or_dry_run = (options: CliRuntimeOptions, operation: string): void => {
	if (options.confirm || options.dryRun) return
	throw new CliError({
		message: `${operation} requires --confirm (or use --dry-run).`,
		exitCode: ExitCode.UnsafeRefused,
		code: 'UNSAFE_OPERATION_REFUSED',
		hint: 'Re-run with --dry-run to preview or --confirm to execute.',
	})
}

export const ensure_agent_destructive_allowed = (
	options: CliRuntimeOptions,
	allow_destructive_flag: boolean,
	operation: string,
): void => {
	if (!options.agentMode) return
	if (allow_destructive_flag) return
	throw new CliError({
		message: `${operation} is blocked in agent mode without --allow-destructive.`,
		exitCode: ExitCode.UnsafeRefused,
		code: 'AGENT_DESTRUCTIVE_BLOCKED',
		hint: 'Pass --allow-destructive with --confirm only when explicitly approved.',
	})
}
