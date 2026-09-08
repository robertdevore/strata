import { ProposalDiff } from './ProposalDiff'
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
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const version = ++listVersion.current
    if (sending) {
      setError('')
      setFeedback('')
    }
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
  useEffect(() => {
    setBusy(null)
    setError('')
    setFeedback('')
  }, [threadId])
  const resolve = async (id: string, approved: boolean) => {
    const requestThread = threadId
    setBusy(id)
    setError('')
    setFeedback('')
    try {
      await window.strata.ai.resolveProposal(id, approved)
      if (currentThread.current !== requestThread) return
      listVersion.current++
      setFeedback(approved ? 'Edit applied.' : 'Proposal rejected.')
      setProposals((items) => items.filter((item) => item.id !== id))
    } catch {
      if (currentThread.current !== requestThread) return
      setError(
        'The edit could not be applied. The note or project may have changed; reject this proposal and request a fresh edit.',
      )
    } finally {
      if (currentThread.current === requestThread) setBusy(null)
    }
  }
  return (
    <section aria-label="AI edit proposals">
      {error && loadedThread === threadId && <p role="alert">{error}</p>}
      {feedback && loadedThread === threadId && <p role="status">{feedback}</p>}
      {(threadId && loadedThread === threadId ? proposals : []).map((proposal) => {
        const payload = proposal.payload as { operation: { op: string }; before: unknown; after: unknown }
        return (
          <details key={proposal.id}>
            <summary>AI edit awaiting approval: {payload.operation.op.replaceAll('_', ' ')}</summary>
            <p>Review the proposed changes. Approval checks the original note revision or project state.</p>
            {payload.operation.op === 'delete_project' && (
              <p>
                Removing this project clears its notes’ project assignment. The notes and their history remain
                saved.
              </p>
            )}
            <ProposalDiff before={payload.before} after={payload.after} />
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
