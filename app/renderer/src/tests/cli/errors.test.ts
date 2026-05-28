import { describe, expect, it } from 'vitest'
import { CliError, to_error_payload } from '../../../../cli/lib/errors'
import { ExitCode } from '../../../../cli/types'

describe('cli error payload formatting', () => {
	it('produces machine-safe error payload shape', () => {
		const err = new CliError({
			message: 'Could not reach Strata API at http://127.0.0.1:3939',
			exitCode: ExitCode.ApiUnavailable,
			code: 'STRATA_API_UNAVAILABLE',
			hint: 'Start Strata, then try again.',
		})
		const payload = to_error_payload(err)
		expect(payload.ok).toBe(false)
		expect(payload.error.code).toBe('STRATA_API_UNAVAILABLE')
		expect(payload.error.message).toContain('Could not reach Strata API')
		expect(payload.error.hint).toBe('Start Strata, then try again.')
	})
})
