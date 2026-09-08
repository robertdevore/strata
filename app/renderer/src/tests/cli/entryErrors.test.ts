import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'

it.each([
  { args: ['--json', 'notes', 'get', 'invalid-id'], code: 'VALIDATION_ERROR' },
  { args: ['--json', '--unknown-option'], code: 'UNKNOWN_OPTION' },
  { args: ['--agent', 'notes', 'get'], code: 'MISSING_ARGUMENT' },
  { args: ['--json', 'unknown-command'], code: 'INVALID_COMMAND' },
  { args: ['--json', 'health'], base: 'invalid-secret-fixture', code: 'INVALID_BASE_URL' },
  { args: ['--json', 'health'], base: 'https://user:secret-fixture@example.com', code: 'INVALID_BASE_URL' },
  { args: ['--json', 'health'], base: 'http://192.168.1.2:3939', code: 'INVALID_BASE_URL' },
])('preserves machine output and validation exit codes: $code $args', ({ args, base, code }) => {
  let result: { status?: number; stdout?: Buffer; stderr?: Buffer } | undefined
  try {
    execFileSync(process.execPath, ['scripts/strata.mjs', ...args], {
      cwd: process.cwd(),
      timeout: 10000,
      stdio: 'pipe',
      env: {
        ...process.env,
        STRATA_API_BASE_URL: base ?? 'http://127.0.0.1:3939',
        STRATA_API_TOKEN: '',
        STRATA_API_CREDENTIAL_FILE: path.join(os.tmpdir(), `strata-no-credential-${randomUUID()}`),
        STRATA_CLI_OUTPUT: 'pretty',
        STRATA_CLI_AGENT_MODE: 'false',
      },
    })
  } catch (error) {
    result = error as typeof result
  }
  expect(result?.status).toBe(2)
  const output = result?.stdout?.toString() ?? ''
  expect(output.trim().split('\n')).toHaveLength(1)
  expect(JSON.parse(output)).toMatchObject({ ok: false, error: { code } })
  expect(output + result?.stderr?.toString()).not.toContain('secret-fixture')
})

it('prints successful machine responses as one JSON line', () => {
  const output = execFileSync(process.execPath, ['scripts/strata.mjs', '--json', 'config', 'show'], {
    cwd: process.cwd(),
    timeout: 10000,
    encoding: 'utf8',
    env: {
      ...process.env,
      STRATA_API_BASE_URL: 'http://127.0.0.1:3939',
      STRATA_API_TOKEN: '',
      STRATA_API_CREDENTIAL_FILE: path.join(os.tmpdir(), `strata-no-credential-${randomUUID()}`),
    },
  })
  expect(output.trim().split('\n')).toHaveLength(1)
  expect(JSON.parse(output)).toMatchObject({ ok: true, data: { outputMode: 'json' } })
})
