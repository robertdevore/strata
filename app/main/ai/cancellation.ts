import { DomainError } from '../../shared/errors'

export function assertNotCancelled(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw new DomainError('CANCELLED', 'AI request cancelled')
}
