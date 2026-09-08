// Deliberately exclude error messages, stacks, paths, request bodies and unknown codes.
const SAFE_CODES = new Set([
  'EADDRINUSE',
  'EACCES',
  'EPERM',
  'ENOENT',
  'ENOSPC',
  'SQLITE_BUSY',
  'SQLITE_LOCKED',
  'SQLITE_CORRUPT',
  'SQLITE_NOTADB',
  'SQLITE_READONLY',
  'CREDENTIAL_MIGRATION_REQUIRED',
  'REVISION_CONFLICT',
  'TIMEOUT',
  'CANCELLED',
  'AUTH_ERROR',
  'RATE_LIMIT',
  'NETWORK_ERROR',
])
export function runtimeErrorCode(error: unknown): string {
  try {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    return typeof code === 'string' && SAFE_CODES.has(code) ? code : 'UNEXPECTED_ERROR'
  } catch {
    return 'UNEXPECTED_ERROR'
  }
}

/** Startup diagnostics contain fixed checkpoints only, including in debug mode. */
export function debugRuntime(checkpoint: string): void {
  if (typeof process !== 'undefined' && process.env.STRATA_DEBUG === '1') console.info(checkpoint)
}
