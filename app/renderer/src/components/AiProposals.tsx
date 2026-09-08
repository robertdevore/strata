import { useEffect, useRef, useState } from 'react'
interface Proposal {
  id: string
  payload: unknown
  createdAt: string
}
export const AiProposals = ({ sending, threadId }: { sending: boolean; threadId: string | null }) => {
  const listVersion = useRef(0)
  const currentThread = useRef(threadId)
  currentThread.current = threadId
  const [loadedThread, setLoadedThread] = useState<string | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const version = ++listVersion.current
    setError('')
    if (!threadId) return
    void window.strata.ai
      .listProposals(threadId)
      .then((items) => {
        if (active && version === listVersion.current) {
          setProposals(items)
          setLoadedThread(threadId)
        }
      })
      .catch(() => {
        if (active && version === listVersion.current) {
          setProposals([])
          setLoadedThread(threadId)
          setError('Could not load pending edits')
        }
      })
    return () => {
      active = false
    }
  }, [sending, threadId])
  useEffect(() => setBusy(null), [threadId])
  const resolve = async (id: string, approved: boolean) => {
    const requestThread = threadId
    setBusy(id)
    setError('')
    try {
      await window.strata.ai.resolveProposal(id, approved)
      if (currentThread.current !== requestThread) return
      listVersion.current++
      setProposals((items) => items.filter((item) => item.id !== id))
    } catch {
      if (currentThread.current !== requestThread) return
      setError(
        'The edit could not be applied. The note may have changed; reject this proposal and request a fresh edit.',
      )
    } finally {
      if (currentThread.current === requestThread) setBusy(null)
    }
  }
  return (
    <section aria-label="AI edit proposals">
      {error && loadedThread === threadId && <p role="alert">{error}</p>}
      {(threadId && loadedThread === threadId ? proposals : []).map((proposal) => {
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
