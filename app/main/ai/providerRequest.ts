import { DomainError } from '../../shared/errors'

export const validateProviderUrl = (value: string): string => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new DomainError('INVALID_ENDPOINT', 'Invalid provider URL')
  }
  const host = url.hostname.toLowerCase()
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host)
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (!local && url.protocol !== 'https:') ||
    !['http:', 'https:'].includes(url.protocol)
  )
    throw new DomainError(
      'INVALID_ENDPOINT',
      'Use HTTPS or an explicitly configured loopback HTTP provider; URL credentials, query and fragments are forbidden',
    )
  if (/^(169\.254\.|0\.|\[fe80:|\[ff|metadata\.)/.test(host))
    throw new DomainError('INVALID_ENDPOINT', 'Metadata and link-local endpoints are forbidden')
  return url.href.replace(/\/$/, '')
}

/** Deadline covers headers and body. Provider bodies and credentials never enter error messages. */
export const requestProviderJson = async (
  url: string,
  init: RequestInit,
  timeoutMs = 60000,
): Promise<unknown> => {
  validateProviderUrl(url)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal })
    if (!response.ok) {
      await response.body?.cancel()
      const code =
        response.status === 401 || response.status === 403
          ? 'AUTH_ERROR'
          : response.status === 429
            ? 'RATE_LIMIT'
            : 'PROVIDER_ERROR'
      throw new DomainError(code, `Provider request failed (${response.status})`)
    }
    if (Number(response.headers.get('content-length') ?? 0) > 4 * 1024 * 1024) {
      await response.body?.cancel()
      throw new DomainError('INVALID_RESPONSE', 'Provider response exceeds limit')
    }
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (!reader) throw new DomainError('INVALID_RESPONSE', 'Provider response is empty')
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 4 * 1024 * 1024) {
          await reader.cancel()
          throw new DomainError('INVALID_RESPONSE', 'Provider response exceeds limit')
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new DomainError('INVALID_RESPONSE', 'Provider returned invalid JSON')
    }
  } catch (error) {
    if (error instanceof DomainError) throw error
    if (controller.signal.aborted) throw new DomainError('TIMEOUT', 'Provider request timed out')
    if (init.signal?.aborted) throw new DomainError('CANCELLED', 'Provider request cancelled')
    throw new DomainError('NETWORK_ERROR', 'Provider connection failed')
  } finally {
    clearTimeout(timeout)
  }
}
