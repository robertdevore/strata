import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note, NotesFilter } from '@shared/types'
import { notesService } from '../services/notesService'
import { useAppStore } from '../state/useAppStore'

type Page = { notes: Note[]; nextCursor: string | null; loading: boolean; error: boolean }
// Project previews have their own bounded pages; they must not depend on the global listing.
export function useProjectListings(ids: string[], filters: NotesFilter, version: unknown) {
  const [pages, setPages] = useState<Record<string, Page>>({})
  const generation = useRef(0)
  const pending = useRef(new Set<string>())
  const key = JSON.stringify({ ids, filters })
  const cache = (notes: Note[]) =>
    useAppStore.setState((current) => {
      const known = new Map(current.notes.map((note) => [note.id, note]))
      for (const note of notes) {
        const old = known.get(note.id)
        if (
          old &&
          (current.drafts[note.id] !== undefined ||
            old.revision > note.revision ||
            (old.contentLoaded && old.revision === note.revision))
        )
          continue
        known.set(note.id, note)
      }
      return { notes: [...known.values()] }
    })
  useEffect(() => {
    const current = ++generation.current
    const { ids, filters } = JSON.parse(key) as { ids: string[]; filters: NotesFilter }
    pending.current.clear()
    setPages(
      Object.fromEntries(ids.map((id) => [id, { notes: [], nextCursor: null, loading: true, error: false }])),
    )
    for (const id of ids) {
      void notesService
        .page({ ...filters, projectId: id, limit: 6 })
        .then((page) => {
          if (generation.current !== current) return
          cache(page.notes)
          setPages((previous) => ({ ...previous, [id]: { ...page, loading: false, error: false } }))
        })
        .catch(() => {
          if (generation.current === current)
            setPages((previous) => ({
              ...previous,
              [id]: { notes: [], nextCursor: null, loading: false, error: true },
            }))
        })
    }
    return () => {
      generation.current = current + 1
    }
  }, [key, version])
  const more = useCallback(
    async (id: string) => {
      const page = pages[id]
      if (!page || page.loading || pending.current.has(id) || (!page.nextCursor && !page.error)) return
      pending.current.add(id)
      const current = generation.current
      setPages((previous) => ({ ...previous, [id]: { ...page, loading: true } }))
      try {
        const { filters } = JSON.parse(key) as { filters: NotesFilter }
        const result = await notesService.page({
          ...filters,
          projectId: id,
          limit: 6,
          cursor: page.nextCursor ?? undefined,
        })
        if (generation.current !== current) return
        cache(result.notes)
        const notes = new Map([...page.notes, ...result.notes].map((note) => [note.id, note]))
        setPages((previous) => ({
          ...previous,
          [id]: { notes: [...notes.values()], nextCursor: result.nextCursor, loading: false, error: false },
        }))
      } catch {
        if (generation.current === current)
          setPages((previous) => ({ ...previous, [id]: { ...page, loading: false, error: true } }))
      } finally {
        if (generation.current === current) pending.current.delete(id)
      }
    },
    [key, pages],
  )
  return { pages, more }
}
