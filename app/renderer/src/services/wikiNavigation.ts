import type { NoteSummary } from '@shared/types'
export class AmbiguousWikiLinkError extends Error {
  readonly matches: NoteSummary[]
  constructor(matches: NoteSummary[]) {
    super('Multiple notes have this title. Choose a note.')
    this.matches = matches
  }
}
/** Resolve through indexed storage; never infer absence from the current sidebar page. */
export async function openWikiLink(
  href: string,
  newTab: boolean,
  open: (id: string, newTab: boolean) => Promise<void>,
): Promise<boolean> {
  const raw = href.startsWith('#strata-note:')
    ? href.slice('#strata-note:'.length)
    : href.startsWith('strata-note://')
      ? href.slice('strata-note://'.length)
      : null
  if (raw === null) return false
  const title = decodeURIComponent(raw.split('#')[0]).trim()
  if (!title || title.length > 500 || /[\r\n]/.test(title)) throw new Error('Invalid link target')
  const resolution = await window.strata.links.resolveTarget(title)
  if (resolution.status === 'ambiguous') throw new AmbiguousWikiLinkError(resolution.matches)
  const note = resolution.status === 'resolved' ? resolution.note : null
  if (!note && window.confirm(`Note "${title}" does not exist. Create it?`)) {
    // The service rechecks existence in the creation transaction to avoid duplicates.
    const created = await window.strata.links.createMissingNote(title)
    if (!created) throw new Error('Could not create note')
    await open(created.id, newTab)
    return true
  }
  if (note) await open(note.id, newTab)
  return true
}
