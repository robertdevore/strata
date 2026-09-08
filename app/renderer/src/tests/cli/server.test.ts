import { describe, expect, it } from 'vitest'
import { resolve_server_bind_environment } from '../../../../cli/commands/server'

describe('standalone server binding', () => {
  it('maps --base-url host and port to the environment consumed by the server', () => {
    expect(resolve_server_bind_environment('http://0.0.0.0:4949')).toEqual({
      STRATA_API_HOST: '0.0.0.0',
      STRATA_API_PORT: '4949',
    })
  })

  it('rejects unsupported URL shapes instead of binding somewhere else', () => {
    expect(() => resolve_server_bind_environment('https://localhost:4949')).toThrow(/http:\/\//)
    expect(() => resolve_server_bind_environment('http://localhost:4949/api')).toThrow(
      /cannot include a path/,
    )
  })
})
