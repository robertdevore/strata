import { DomainError } from '../../shared/errors'

/** Bound in-flight work and scope cancellation to the renderer that started it. */
export class ActiveAiRequests {
  private requests = new Map<string, { owner: number; controller: AbortController; threadId?: string }>()
  private readonly limit: number
  constructor(limit = 4) {
    this.limit = limit
  }

  start(
    id: string,
    owner: number,
  ): { signal: AbortSignal; finish: () => void; cancel: () => void; bindThread: (threadId: string) => void } {
    if (this.requests.has(id)) throw new DomainError('CONFLICT', 'AI request ID is already active')
    if (this.requests.size >= this.limit) throw new DomainError('AI_BUSY', 'Too many AI requests are active')
    const entry: { owner: number; controller: AbortController; threadId?: string } = {
      owner,
      controller: new AbortController(),
    }
    this.requests.set(id, entry)
    return {
      signal: entry.controller.signal,
      bindThread: (threadId) => {
        entry.threadId = threadId
      },
      cancel: () => entry.controller.abort(),
      finish: () => {
        if (this.requests.get(id) === entry) this.requests.delete(id)
      },
    }
  }

  /** Deleting a conversation invalidates its work across all renderer owners. */
  cancelThread(threadId: string): void {
    for (const entry of this.requests.values()) if (entry.threadId === threadId) entry.controller.abort()
  }

  cancel(id: string, owner: number): boolean {
    const entry = this.requests.get(id)
    if (!entry || entry.owner !== owner) return false
    entry.controller.abort()
    // Keep the slot occupied until the actual request settles.
    return true
  }
}
