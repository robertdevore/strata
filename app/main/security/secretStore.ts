import fs from 'node:fs'
import path from 'node:path'
import type { Settings } from '../../shared/types'

export const SECRET_KEYS = [
  'openAiApiKey',
  'aiDeepseekApiKey',
  'aiKimiApiKey',
  'aiOpenrouterApiKey',
  'aiCustomApiKey',
] as const
export type SecretKey = (typeof SECRET_KEYS)[number]
export const SECRET_PRESENT = '••••••••'
export interface SecretStore {
  get(key: SecretKey): string
  set(key: SecretKey, value: string): void
}
export interface EncryptionBackend {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
  getSelectedStorageBackend?: () => string
}

/** Only encrypted bytes reach disk. Fail closed on Linux's plaintext basic_text backend. */
export class EncryptedSecretStore implements SecretStore {
  private directory: string
  private backend: EncryptionBackend
  constructor(directory: string, backend: EncryptionBackend) {
    this.directory = directory
    this.backend = backend
  }
  private check(): void {
    if (!this.backend.isEncryptionAvailable() || this.backend.getSelectedStorageBackend?.() === 'basic_text')
      throw new Error(
        'OS credential encryption is unavailable; configure an OS keyring before using provider keys',
      )
  }
  get(key: SecretKey): string {
    const file = path.join(this.directory, key)
    if (!fs.existsSync(file)) return ''
    this.check()
    return this.backend.decryptString(fs.readFileSync(file))
  }
  set(key: SecretKey, value: string): void {
    const file = path.join(this.directory, key)
    if (!value) {
      fs.rmSync(file, { force: true })
      return
    }
    this.check()
    const encrypted = this.backend.encryptString(value)
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, encrypted, { mode: 0o600, flag: 'wx' })
    try {
      fs.renameSync(temporary, file)
    } finally {
      fs.rmSync(temporary, { force: true })
    }
  }
}

export const redactSettings = (settings: Settings): Settings => {
  const result = { ...settings }
  for (const key of SECRET_KEYS) result[key] = settings[key] ? SECRET_PRESENT : ''
  return result
}
