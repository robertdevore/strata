import { assertNotCancelled } from './cancellation'
import { DomainError } from '../../shared/errors'

const forbiddenLiteral = (host: string): boolean => {
  // URL has already canonicalized numeric IPv4 and compressed IPv6 aliases.
  const forbiddenV4 = (address: string) => {
    const [first, second] = address.split('.').map(Number)
    return first === 0 || (first === 169 && second === 254) || first >= 224
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return forbiddenV4(host)
  if (!host.startsWith('[')) return false
  const address = host.slice(1, -1)
  if (address === '::') return true
  const first = Number.parseInt(address.split(':')[0], 16)
  if ((first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return true
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(address)
  if (!mapped) return false
  const high = Number.parseInt(mapped[1], 16)
  const low = Number.parseInt(mapped[2], 16)
  return forbiddenV4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
}

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
  if (forbiddenLiteral(host) || host === 'metadata' || host.startsWith('metadata.'))
    throw new DomainError('INVALID_ENDPOINT', 'Metadata and link-local endpoints are forbidden')
  // Plain HTTP never depends on a hostname resolving back to loopback.
  if (url.protocol === 'http:' && host === 'localhost') url.hostname = '127.0.0.1'
  return url.href.replace(/\/$/, '')
}

/** Deadline covers headers and body. Provider bodies and credentials never enter error messages. */
export const requestProviderJson = async (
  url: string,
  init: RequestInit,
  timeoutMs = 60000,
): Promise<unknown> => {
  const endpoint = validateProviderUrl(url)
  assertNotCancelled(init.signal)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal
  try {
    const response = await fetch(endpoint, { ...init, redirect: 'error', signal })
    if (signal.aborted) {
      await response.body?.cancel()
      assertNotCancelled(init.signal)
      throw new DomainError('TIMEOUT', 'Provider request timed out')
    }
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
    assertNotCancelled(init.signal)
    if (controller.signal.aborted) throw new DomainError('TIMEOUT', 'Provider request timed out')
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new DomainError('INVALID_RESPONSE', 'Provider returned invalid JSON')
    }
  } catch (error) {
    assertNotCancelled(init.signal)
    if (error instanceof DomainError) throw error
    if (controller.signal.aborted) throw new DomainError('TIMEOUT', 'Provider request timed out')
    throw new DomainError('NETWORK_ERROR', 'Provider connection failed')
  } finally {
    clearTimeout(timeout)
  }
}
