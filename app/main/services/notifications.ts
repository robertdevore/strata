import type { ChangedDomains } from '../../shared/changedDomains'

/** A refresh failure must never turn a committed write into a reported write failure. */
export const notifyCommittedChanges = (
  listener: ((changed: ChangedDomains) => void) | undefined,
  changed: ChangedDomains,
): void => {
  try {
    listener?.(changed)
  } catch {
    console.warn('[Strata] Data-change notification failed after commit.')
  }
}
