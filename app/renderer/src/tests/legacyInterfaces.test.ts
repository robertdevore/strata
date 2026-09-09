import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('retired legacy network interfaces', () => {
  for (const script of ['strata-ai.mjs', 'strata-paperclip-bridge.mjs']) {
    it(`${script} fails closed without forwarding configured credentials`, () => {
      try {
        execFileSync(process.execPath, [resolve('scripts', script), 'health'], {
          env: {
            ...process.env,
            STRATA_API_TOKEN: 'synthetic-secret-not-for-output',
            STRATA_API_BASE_URL: 'http://192.0.2.1',
          },
          timeout: 3000,
          stdio: 'pipe',
        })
        throw new Error('Legacy command unexpectedly succeeded')
      } catch (error) {
        const result = error as { status?: number; stdout?: Buffer; stderr?: Buffer }
        expect(result.status).toBe(1)
        expect(result.stdout?.toString()).toBe('')
        expect(result.stderr?.toString()).toContain('LEGACY_INTERFACE_RETIRED')
        expect(result.stderr?.toString()).not.toContain('synthetic-secret')
      }
    })
  }
})
