import { useRef, useState } from 'react'
import type { Note } from '@shared/types'
import { useAppStore } from '../state/useAppStore'
export const MoreNotes = () => {
  const cursor = useAppStore((state) => state.nextCursor)
  const error = useAppStore((state) => state.retrievalError)
  const refresh = useAppStore((state) => state.refreshListing)
  const [busy, setBusy] = useState(false)
  if (!cursor && !error) return null
  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void refresh(Boolean(cursor)).finally(() => setBusy(false))
        }}
      >
        {busy ? 'Loading…' : error ? 'Retry' : 'Load more notes'}
      </button>
    </div>
  )
}
export const DraftConflict = () => {
  const status = useAppStore((state) => state.saveState)
  const id = useAppStore((state) => state.selectedNoteId)
  const resolve = useAppStore((state) => state.resolveConflict)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (status !== 'conflict' || !id) return null
  const apply = (copy: boolean) => {
    setBusy(true)
    void resolve(id, copy)
      .catch(() => setError('Could not recover the draft. It remains in the editor.'))
      .finally(() => setBusy(false))
  }
  return (
    <div role="alert">
      <p>This note changed elsewhere. Your draft is preserved.</p>
      {error && <p>{error}</p>}
      <button disabled={busy} onClick={() => apply(true)}>
        Save draft as new note and reload
      </button>
      <button disabled={busy} onClick={() => apply(false)}>
        Discard draft and reload
      </button>
    </div>
  )
}

export const NoteHistory = () => {
  const note = useAppStore((state) => state.notes.find((note) => note.id === state.selectedNoteId))
  const dirty = useAppStore((state) =>
    state.selectedNoteId ? state.drafts[state.selectedNoteId] !== undefined : false,
  )
  return note ? <NoteHistoryDetails key={note.id} note={note} dirty={dirty} /> : null
}

const NoteHistoryDetails = ({ note, dirty }: { note: Note; dirty: boolean }) => {
  const request = useRef(0)
  const expectedRevision = useRef(note.revision)
  const [revisions, setRevisions] = useState<Array<{ revision: number; source: string; createdAt: string }>>(
    [],
  )
  const [snapshot, setSnapshot] = useState<import('@shared/types').NoteRevision | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => {
    const generation = ++request.current
    try {
      setSnapshot(null)
      setError('')
      const history = await window.strata.notes.history(note.id)
      if (generation === request.current) setRevisions(history)
    } catch {
      if (generation === request.current) setError('Could not load revision history')
    }
  }
  const restore = async () => {
    if (!snapshot || snapshot.noteId !== note.id || dirty) return
    setBusy(true)
    try {
      await window.strata.notes.restoreRevision(note.id, snapshot.revision, expectedRevision.current)
      setSnapshot(null)
      await useAppStore.getState().load()
      await load()
    } catch {
      setError('Restore conflicted with a newer edit. Reload history and review the current note.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void load()
      }}
    >
      <summary>Note revision history</summary>
      {error && <p role="alert">{error}</p>}
      {revisions.map((revision) => (
        <button
          key={revision.revision}
          onClick={() => {
            const generation = ++request.current
            const baseRevision = note.revision
            setSnapshot(null)
            setError('')
            void window.strata.notes
              .getRevision(note.id, revision.revision)
              .then((value) => {
                if (generation !== request.current) return
                expectedRevision.current = baseRevision
                setSnapshot(value)
              })
              .catch(() => {
                if (generation === request.current) setError('Could not read revision')
              })
          }}
        >
          Revision {revision.revision} · {revision.source} · {revision.createdAt}
        </button>
      ))}
      {snapshot && snapshot.noteId === note.id && (
        <div>
          <pre style={{ maxHeight: 250, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {snapshot.snapshot.content}
          </pre>
          <button disabled={busy || dirty} onClick={() => void restore()}>
            Restore revision {snapshot.revision}
          </button>
          {dirty && <p>Save or recover your draft before restoring history.</p>}
        </div>
      )}
    </details>
  )
}
