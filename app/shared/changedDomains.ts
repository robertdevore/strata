/** Cache domains invalidated by a committed operation; no note contents cross this event. */
export interface ChangedDomains {
  notes: boolean
  projects: boolean
  tags: boolean
  links: boolean
  history: boolean
}
export const NO_CHANGED: ChangedDomains = {
  notes: false,
  projects: false,
  tags: false,
  links: false,
  history: false,
}
export const ALL_CHANGED: ChangedDomains = {
  notes: true,
  projects: true,
  tags: true,
  links: true,
  history: true,
}
export const mergeChanged = (...changes: ChangedDomains[]): ChangedDomains => ({
  notes: changes.some((change) => change.notes),
  projects: changes.some((change) => change.projects),
  tags: changes.some((change) => change.tags),
  links: changes.some((change) => change.links),
  history: changes.some((change) => change.history),
})
export const hasChanges = (changed: ChangedDomains): boolean => Object.values(changed).some(Boolean)
