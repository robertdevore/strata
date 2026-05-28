import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('cli architecture safety', () => {
	it('does not import sqlite modules in API client', () => {
		const file_path = path.resolve(__dirname, '../../../../cli/lib/apiClient.ts')
		const source = readFileSync(file_path, 'utf-8')
		expect(source.includes('better-sqlite3')).toBe(false)
		expect(source.includes('app/main/db')).toBe(false)
	})
})
