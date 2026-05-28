export type OutputMode = 'pretty' | 'json'

export const ExitCode = {
	Success: 0,
	GenericFailure: 1,
	ValidationError: 2,
	ApiUnavailable: 3,
	AuthFailure: 4,
	NotFound: 5,
	UnsafeRefused: 6,
	AiProviderFailure: 7,
	Timeout: 8,
	PartialFailure: 9,
} as const

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode]

export interface CliRuntimeOptions {
	baseUrl: string
	token: string | null
	outputMode: OutputMode
	quiet: boolean
	verbose: boolean
	dryRun: boolean
	confirm: boolean
	timeoutMs: number
	agentMode: boolean
	noColor: boolean
	failOnWarning: boolean
}

export interface CliErrorPayload {
	ok: false
	error: {
		code: string
		message: string
		hint?: string
		details?: unknown
	}
}

export interface CliSuccessPayload<TData extends Record<string, unknown>> {
	ok: true
	dryRun?: boolean
	data: TData
}

export interface CliContext {
	options: CliRuntimeOptions
}
