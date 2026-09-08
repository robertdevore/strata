export interface MutationOutcome {
  operation: string
  status: 'applied' | 'unchanged' | 'proposed' | 'failed'
  entities: Array<{ kind: 'note' | 'project'; id: string; title?: string; revision?: number }>
  proposalId?: string
  errorCode?: string
}
export type ToolLoopStop = 'complete' | 'context_limit' | 'tool_limit'
const appliedLabels: Record<string, string> = {
  create_note: 'Created note',
  update_note: 'Updated note',
  create_project: 'Created project',
  rename_project: 'Renamed project',
  delete_project: 'Removed project',
  reorder_projects: 'Reordered projects',
}
const label = (value: string) =>
  Array.from(value)
    .slice(0, 120)
    .join('')
    .replace(/[()[\]\\]/g, '\\$&')

/** Mutation reports use execution receipts, never the provider's claims of success. */
export const formatExecutionReport = (
  providerContent: string,
  outcomes: MutationOutcome[],
  stop: ToolLoopStop,
  requestedMutation: boolean,
): string => {
  const prefix =
    stop === 'tool_limit'
      ? 'Tool-call limit reached.'
      : stop === 'context_limit'
        ? 'Context budget reached.'
        : ''
  if (!outcomes.length) {
    // A narrow language check remains only as defense in depth for unsolicited write claims.
    const suspicious =
      /\b(done|updated|edited|inserted|added|applied|patched|rewrote|reordered|renamed|deleted|removed|restored|created)\b/i.test(
        providerContent,
      ) && /\b(note|notes|project|projects|markdown|todo|section|content)\b/i.test(providerContent)
    if (requestedMutation || suspicious)
      return [
        prefix,
        'No changes were applied. No mutation tool completed this request.',
        requestedMutation ? '' : providerContent,
      ]
        .filter(Boolean)
        .join('\n\n')
    return providerContent
  }
  const lines = outcomes.map((outcome) => {
    const operation = outcome.operation.replaceAll('_', ' ')
    if (outcome.status === 'failed') return `Could not ${operation} (${outcome.errorCode ?? 'ERROR'}).`
    if (outcome.status === 'proposed') return `Proposed action: ${operation}; not applied.`
    const entities = outcome.entities
      .slice(0, 20)
      .map((entity) =>
        entity.kind === 'note'
          ? `[${label(entity.title || 'Note')}](#strata-note:${entity.id})${entity.revision ? ` (revision ${entity.revision})` : ''}`
          : `Project “${label(entity.title || entity.id)}”`,
      )
    if (outcome.entities.length > 20) entities.push(`and ${outcome.entities.length - 20} more`)
    return `${outcome.status === 'unchanged' ? 'No change needed' : (appliedLabels[outcome.operation] ?? `Applied ${operation}`)}${entities.length ? `: ${entities.join(', ')}` : ''}.`
  })
  if (outcomes.some((outcome) => outcome.status === 'proposed'))
    lines.unshift('Edits are awaiting your approval in the proposal panel.')
  return [prefix, ...lines].filter(Boolean).join('\n\n')
}
