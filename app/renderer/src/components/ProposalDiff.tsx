import { textChange } from './proposalTextDiff'
interface Snapshot {
  content?: unknown
  [field: string]: unknown
}
const asSnapshot = (value: unknown): Snapshot =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Snapshot) : {}

const valueText = (value: unknown) =>
  value === undefined || value === null
    ? 'None'
    : typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : typeof value === 'string'
        ? value
        : JSON.stringify(value)
const fields = {
  tags: 'Tags',
  starred: 'Starred',
  archived: 'Archived',
  projectId: 'Project ID',
  name: 'Name',
  sortOrder: 'Position',
}
const blockStyle = { maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap' as const }
export const ProposalDiff = ({ before, after }: { before: unknown; after: unknown }) => {
  const previous = asSnapshot(before)
  const proposed = asSnapshot(after)
  const hasText = typeof previous.content === 'string' || typeof proposed.content === 'string'
  const changedFields = Object.entries(fields).filter(
    ([field]) => JSON.stringify(previous[field]) !== JSON.stringify(proposed[field]),
  )
  return (
    <>
      {hasText && (
        <>
          <h4>Text changes</h4>
          <p>− removes text; + adds text. Unchanged leading and trailing lines are omitted.</p>
          <pre style={blockStyle}>
            {textChange(String(previous.content ?? ''), String(proposed.content ?? ''))}
          </pre>
        </>
      )}
      {changedFields.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {changedFields.map(([field, label]) => (
              <tr key={field}>
                <th>{label}</th>
                <td>{valueText(previous[field])}</td>
                <td>{valueText(proposed[field])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details open={!hasText && changedFields.length === 0}>
        <summary>Complete before and after states</summary>
        <h4>Before</h4>
        <pre style={blockStyle}>{JSON.stringify(before, null, 2)}</pre>
        <h4>After</h4>
        <pre style={blockStyle}>{JSON.stringify(after, null, 2)}</pre>
      </details>
    </>
  )
}
