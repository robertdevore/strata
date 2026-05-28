import { ExitCode, type CliErrorPayload, type CliRuntimeOptions } from '../types'
import { ZodError } from 'zod'

export class CliError extends Error {
	readonly exitCode: ExitCode
	readonly code: string
	readonly hint?: string
	readonly details?: unknown

	constructor(params: {
		message: string
		exitCode?: ExitCode
		code?: string
		hint?: string
		details?: unknown
	}) {
		super(params.message)
		this.name = 'CliError'
		this.exitCode = params.exitCode ?? ExitCode.GenericFailure
		this.code = params.code ?? 'CLI_ERROR'
		this.hint = params.hint
		this.details = params.details
	}
}

export const map_http_status_to_exit_code = (status: number): ExitCode => {
	if (401 === status || 403 === status) return ExitCode.AuthFailure
	if (404 === status) return ExitCode.NotFound
	if (408 === status) return ExitCode.Timeout
	if (409 === status || 422 === status) return ExitCode.ValidationError
	if (status >= 500) return ExitCode.ApiUnavailable
	return ExitCode.GenericFailure
}

export const to_error_payload = (error: unknown): CliErrorPayload => {
	if (error instanceof ZodError) {
		return {
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Validation failed.',
				details: error.issues,
			},
		}
	}

	if (error instanceof CliError) {
		return {
			ok: false,
			error: {
				code: error.code,
				message: error.message,
				hint: error.hint,
				details: error.details,
			},
		}
	}

	if (error instanceof Error) {
		return {
			ok: false,
			error: {
				code: 'UNEXPECTED_ERROR',
				message: error.message,
			},
		}
	}

	return {
		ok: false,
		error: {
			code: 'UNEXPECTED_ERROR',
			message: 'Unknown error',
		},
	}
}

export const get_exit_code = (error: unknown): ExitCode => {
	if (error instanceof ZodError) return ExitCode.ValidationError
	if (error instanceof CliError) return error.exitCode
	return ExitCode.GenericFailure
}

export const print_error = (error: unknown, options: CliRuntimeOptions): void => {
	const payload = to_error_payload(error)
	if ('json' === options.outputMode) {
		process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
		return
	}

	if (options.quiet) {
		process.stderr.write(`${payload.error.message}\n`)
		return
	}

	process.stderr.write(`Error: ${payload.error.message}\n`)
	if (payload.error.hint) {
		process.stderr.write(`Hint: ${payload.error.hint}\n`)
	}
	if (options.verbose && payload.error.details) {
		process.stderr.write(`Details: ${JSON.stringify(payload.error.details, null, 2)}\n`)
	}
}
