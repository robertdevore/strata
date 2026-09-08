import fs from 'node:fs'
import type Database from 'better-sqlite3'
import { DomainError } from '../../shared/errors'

/** OS-released locks on coordination files that are never replaced with the note database. */
export class LibraryAccess {
  private connection: Database.Database
  private gate: Database.Database | undefined
  private filename: string
  private Driver: typeof Database

  constructor(filename: string, Driver: typeof Database) {
    this.filename = filename
    this.Driver = Driver
    const gate = this.openGate()
    try {
      this.connection = new Driver(filename, { timeout: 0 })
      try {
        this.connection.pragma('foreign_keys = ON')
        if (this.connection.pragma('journal_mode', { simple: true }) !== 'delete')
          throw new Error('Invalid coordination journal mode')
        this.connection.exec('CREATE TABLE IF NOT EXISTS library_access (id INTEGER PRIMARY KEY)')
        fs.chmodSync(filename, 0o600)
        this.readLease()
      } catch {
        this.connection.close()
        throw new DomainError('LIBRARY_ACCESS_ERROR', 'Cannot acquire safe access to this library.')
      }
    } finally {
      gate.close()
    }
  }

  private openGate(): Database.Database {
    let gate: Database.Database | undefined
    try {
      gate = new this.Driver(`${this.filename}.gate.sqlite`, { timeout: 0 })
      gate.pragma('foreign_keys = ON')
      if (gate.pragma('journal_mode', { simple: true }) !== 'delete') throw new Error('Invalid journal mode')
      gate.exec('BEGIN EXCLUSIVE')
      fs.chmodSync(`${this.filename}.gate.sqlite`, 0o600)
      return gate
    } catch {
      gate?.close()
      throw new DomainError(
        'LIBRARY_BUSY',
        'Another Strata process is opening or restoring this library. Retry after it finishes.',
      )
    }
  }

  private readLease(): void {
    this.connection.exec('BEGIN; SELECT * FROM library_access')
  }

  /** Retains exclusion until close; call immediately before closing/replacing the note DB. */
  exclusive(): void {
    // The gate prevents new owners/restorers entering during the shared-to-exclusive transition.
    const gate = this.openGate()
    try {
      this.connection.exec('ROLLBACK')
      try {
        this.connection.exec('BEGIN EXCLUSIVE')
      } catch {
        this.readLease()
        throw new DomainError(
          'LIBRARY_BUSY',
          'Close other Strata processes using this library before restoring a backup.',
        )
      }
      this.gate = gate
    } catch (error) {
      gate.close()
      throw error
    }
  }

  shared(): void {
    if (!this.gate) return
    this.connection.exec('ROLLBACK')
    this.readLease()
    this.gate.close()
    this.gate = undefined
  }

  close(): void {
    try {
      this.connection.close()
    } finally {
      this.gate?.close()
      this.gate = undefined
    }
  }
}
