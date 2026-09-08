import { DomainError } from '../../shared/errors'

/** Bound in-flight work and scope cancellation to the renderer that started it. */
export class ActiveAiRequests {
  private requests = new Map<string, { owner: number; controller: AbortController }>()
  private readonly limit: number
  constructor(limit = 4) {
    this.limit = limit
  }

  start(id: string, owner: number): { signal: AbortSignal; finish: () => void; cancel: () => void } {
    if (this.requests.has(id)) throw new DomainError('CONFLICT', 'AI request ID is already active')
    if (this.requests.size >= this.limit) throw new DomainError('AI_BUSY', 'Too many AI requests are active')
    const entry = { owner, controller: new AbortController() }
    this.requests.set(id, entry)
    return {
      signal: entry.controller.signal,
      cancel: () => entry.controller.abort(),
      finish: () => {
        if (this.requests.get(id) === entry) this.requests.delete(id)
      },
    }
  }

  cancel(id: string, owner: number): boolean {
    const entry = this.requests.get(id)
    if (!entry || entry.owner !== owner) return false
    entry.controller.abort()
    // Keep the slot occupied until the actual request settles.
    return true
  }
}
