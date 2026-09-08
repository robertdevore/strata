import { useEffect, useState } from 'react'
interface Proposal {
  id: string
  payload: unknown
  createdAt: string
}
export const AiProposals = ({ sending }: { sending: boolean }) => {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void window.strata.ai
      .listProposals()
      .then((items) => {
        if (active) setProposals(items)
      })
      .catch(() => {
        if (active) setError('Could not load pending edits')
      })
    return () => {
      active = false
    }
  }, [sending])
  const resolve = async (id: string, approved: boolean) => {
    setBusy(id)
    setError('')
    try {
      await window.strata.ai.resolveProposal(id, approved)
      setProposals((items) => items.filter((item) => item.id !== id))
    } catch {
      setError(
        'The edit could not be applied. The note may have changed; reject this proposal and request a fresh edit.',
      )
    } finally {
      setBusy(null)
    }
  }
  return (
    <section aria-label="AI edit proposals">
      {error && <p role="alert">{error}</p>}
      {proposals.map((proposal) => {
        const payload = proposal.payload as { operation: { op: string }; before: unknown; after: unknown }
        return (
          <details key={proposal.id}>
            <summary>AI edit awaiting approval: {payload.operation.op.replaceAll('_', ' ')}</summary>
            <p>Review the complete before and proposed after state. Applying checks the original revision.</p>
            <h4>Before</h4>
            <pre style={{ maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(payload.before, null, 2)}
            </pre>
            <h4>After</h4>
            <pre style={{ maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(payload.after, null, 2)}
            </pre>
            <button disabled={busy !== null} onClick={() => void resolve(proposal.id, true)}>
              Approve edit
            </button>
            <button disabled={busy !== null} onClick={() => void resolve(proposal.id, false)}>
              Reject
            </button>
          </details>
        )
      })}
    </section>
  )
}
