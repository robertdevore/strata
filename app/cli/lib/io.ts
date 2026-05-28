import { promises as fs } from 'node:fs'
import { CliError } from './errors'
import { ExitCode } from '../types'

export const read_content_input = async (params: {
	content?: string
	file?: string
	stdin?: boolean
}): Promise<string> => {
	const providers = [
		params.content ? 'content' : null,
		params.file ? 'file' : null,
		params.stdin ? 'stdin' : null,
	].filter(Boolean)

	if (providers.length > 1) {
		throw new CliError({
			message: 'Provide exactly one content source: --content, --file, or --stdin.',
			exitCode: ExitCode.ValidationError,
			code: 'INVALID_INPUT_SOURCE',
		})
	}

	if (params.content) return params.content

	if (params.file) {
		try {
			return await fs.readFile(params.file, 'utf-8')
		} catch (error) {
			throw new CliError({
				message: `Could not read file: ${params.file}`,
				exitCode: ExitCode.ValidationError,
				code: 'FILE_READ_FAILED',
				details: error instanceof Error ? error.message : String(error),
			})
		}
	}

	if (params.stdin) {
		const chunks: Buffer[] = []
		for await (const chunk of process.stdin) {
			const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
			chunks.push(data)
		}
		return Buffer.concat(chunks).toString('utf-8')
	}

	throw new CliError({
		message: 'No content input provided. Use --content, --file, or --stdin.',
		exitCode: ExitCode.ValidationError,
		code: 'MISSING_CONTENT_INPUT',
	})
}
