import { randomUUID } from 'node:crypto'

interface CloseGuardOptions {
  requestSave: (requestId: string) => void
  confirmDiscard: () => Promise<boolean>
  complete: (quit: boolean) => void
  cancelled: () => void
  timeoutMs?: number
}

/** Coordinates one graceful close request without trusting late renderer replies. */
export class DraftCloseGuard {
  ready = false
  approved = false
  private options: CloseGuardOptions
  private generation = 0
  private quitRequested = false
  private busy: Promise<void> | undefined
  private pending:
    | {
        id: string
        resolve: (saved: boolean) => void
        timer: ReturnType<typeof setTimeout>
      }
    | undefined

  constructor(options: CloseGuardOptions) {
    this.options = options
  }

  reset(): void {
    this.generation++
    this.ready = false
    this.approved = false
    this.quitRequested = false
    this.busy = undefined
    const pending = this.pending
    this.pending = undefined
    if (pending) {
      clearTimeout(pending.timer)
      pending.resolve(false)
    }
  }

  reply(requestId: string, saved: boolean): boolean {
    const pending = this.pending
    if (!pending || pending.id !== requestId) return false
    this.pending = undefined
    clearTimeout(pending.timer)
    pending.resolve(saved)
    return true
  }

  intercept(event: { preventDefault: () => void }, quit = false): Promise<void> | undefined {
    if (!this.ready || this.approved) return
    event.preventDefault()
    if (quit) this.quitRequested = true
    if (this.busy) return this.busy
    const generation = this.generation
    this.busy = this.prepare(generation).finally(() => {
      if (generation === this.generation) this.busy = undefined
    })
    return this.busy
  }

  private async prepare(generation: number): Promise<void> {
    try {
      const saved = await new Promise<boolean>((resolve) => {
        const id = randomUUID()
        const timer = setTimeout(() => {
          this.pending = undefined
          resolve(false)
        }, this.options.timeoutMs ?? 10000)
        this.pending = { id, timer, resolve }
        try {
          this.options.requestSave(id)
        } catch {
          this.reply(id, false)
        }
      })
      if (generation !== this.generation) return
      const allowed = saved || (await this.options.confirmDiscard())
      if (generation !== this.generation) return
      if (allowed) {
        this.approved = true
        this.options.complete(this.quitRequested)
      } else {
        this.cancel()
      }
    } catch {
      if (generation === this.generation) this.cancel()
    }
  }

  private cancel(): void {
    this.approved = false
    this.quitRequested = false
    try {
      this.options.cancelled()
    } catch {
      // A destroyed renderer cannot be re-enabled; never turn that failure into approval.
    }
  }
}
