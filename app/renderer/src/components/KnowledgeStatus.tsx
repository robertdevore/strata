import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from './icons'
import type { Note } from '@shared/types'
import { useAppStore } from '../state/useAppStore'
export const MoreNotes = () => {
  const cursor = useAppStore((state) => state.nextCursor)
  const error = useAppStore((state) => state.retrievalError)
  const refresh = useAppStore((state) => state.refreshListing)
  const [busy, setBusy] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const loading = useRef(false)
  useEffect(() => {
    const element = sentinel.current
    if (!element || !cursor || error) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loading.current) return
        loading.current = true
        setBusy(true)
        void refresh(true).finally(() => {
          loading.current = false
          setBusy(false)
        })
      },
      { root: element.closest('.sidebar-scroll'), rootMargin: '80px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [cursor, error, refresh])
  return (
    <div ref={sentinel} className="sidebar-page-sentinel" aria-live="polite">
      {busy && <span>Loading notes…</span>}
      {error && (
        <>
          <p role="alert">{error}</p>
          <button className="ghost-button" disabled={busy} onClick={() => void refresh(Boolean(cursor))}>
            Retry loading notes
          </button>
        </>
      )}
    </div>
  )
}
export const DraftConflict = ({ noteId: id }: { noteId: string }) => {
  const status = useAppStore((state) => state.saveStates[id])
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
  const historyVersion = useAppStore((state) => state.historyVersion)
  const details = useRef<HTMLDetailsElement>(null)
  const request = useRef(0)
  const historyRequest = useRef(0)
  useEffect(() => {
    if (!details.current?.open) return
    let current = true
    const generation = ++historyRequest.current
    void window.strata.notes
      .history(note.id)
      .then((value) => {
        if (current && generation === historyRequest.current) setRevisions(value)
      })
      .catch(() => {
        if (current && generation === historyRequest.current) setError('Could not load revision history')
      })
    return () => {
      current = false
    }
  }, [historyVersion, note.id])
  const expectedRevision = useRef(note.revision)
  const [revisions, setRevisions] = useState<Array<{ revision: number; source: string; createdAt: string }>>(
    [],
  )
  const [snapshot, setSnapshot] = useState<import('@shared/types').NoteRevision | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => {
    request.current++
    const generation = ++historyRequest.current
    try {
      setSnapshot(null)
      setError('')
      const history = await window.strata.notes.history(note.id)
      if (generation === historyRequest.current) setRevisions(history)
    } catch {
      if (generation === historyRequest.current) setError('Could not load revision history')
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
      className="note-history"
      ref={details}
      onToggle={(event) => {
        if (event.currentTarget.open) void load()
      }}
    >
      <summary>
        <span>Note revision history</span>
        <ChevronDownIcon size={14} />
      </summary>
      <div className="note-history-panel">
        {error && <p role="alert">{error}</p>}
        {revisions.map((revision) => (
          <button
            className="ghost-button note-history-revision"
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
            Revision {revision.revision} · {revision.source} ·{' '}
            {Number.isNaN(Date.parse(revision.createdAt))
              ? revision.createdAt
              : new Date(revision.createdAt).toLocaleString()}
          </button>
        ))}
        {snapshot && snapshot.noteId === note.id && (
          <div>
            <pre style={{ maxHeight: 250, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {snapshot.snapshot.content}
            </pre>
            <button className="primary-button" disabled={busy || dirty} onClick={() => void restore()}>
              Restore revision {snapshot.revision}
            </button>
            {dirty && <p>Save or recover your draft before restoring history.</p>}
          </div>
        )}
      </div>
    </details>
  )
}
