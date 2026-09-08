import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'

export const credentialPath = (): string =>
  process.env.STRATA_API_CREDENTIAL_FILE || path.join(os.homedir(), '.strata', 'api-token')

export const readLocalCredential = (): string | null => {
  const file = credentialPath()
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
      throw new Error('Invalid API credential file')
    if (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
      throw new Error('API credential must be owned by the current user with mode 0600')
    const token = fs.readFileSync(file, 'utf8').trim()
    if (token.length < 32) throw new Error('Invalid API credential')
    return token
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export const ensureLocalCredential = (): string => {
  const explicit = process.env.STRATA_API_TOKEN?.trim()
  if (explicit) {
    if (explicit.length < 32 || explicit.length > 4096)
      throw new Error('STRATA_API_TOKEN must contain 32–4096 characters')
    return explicit
  }
  const existing = readLocalCredential()
  if (existing) return existing
  const file = credentialPath()
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const token = randomBytes(32).toString('hex')
  try {
    fs.writeFileSync(file, token, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  return readLocalCredential()!
}

export const tokensEqual = (actual: string | null, expected: string): boolean => {
  const a = Buffer.from(actual ?? '')
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const isLoopbackHost = (host: string): boolean =>
  ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(host.toLowerCase())
