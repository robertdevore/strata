import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '@shared/types'
import { deriveNoteTitle, formatRelativeTime } from '@renderer/src/domain/noteUtils'
import { notesService } from '../services/notesService'
import type { UiCommand } from '@renderer/src/utils/commands'

export type PaletteMode = 'quick-open' | 'commands'

interface PaletteCommand {
  id: UiCommand | 'toggle-preview' | 'toggle-chat-panel' | 'open-settings' | 'export-markdown'
  label: string
  shortcut?: string
  requiresNote?: boolean
}

const COMMANDS: PaletteCommand[] = [
  { id: 'new-note', label: 'New Note', shortcut: '⌘N' },
  { id: 'save-note', label: 'Save Note', shortcut: '⌘S' },
  { id: 'toggle-star', label: 'Toggle Star', shortcut: '⌘⇧S', requiresNote: true },
  { id: 'toggle-archive', label: 'Toggle Archive', shortcut: '⌘⇧A', requiresNote: true },
  { id: 'open-tags-editor', label: 'Edit Tags', shortcut: '⌘T', requiresNote: true },
  { id: 'delete-note', label: 'Delete Note', shortcut: '⌘⌫', requiresNote: true },
  { id: 'toggle-filters', label: 'Toggle Filters Panel', shortcut: '⌘⇧F' },
  { id: 'toggle-preview', label: 'Toggle Preview', requiresNote: true },
  { id: 'toggle-chat-panel', label: 'Toggle AI Chat Panel' },
  { id: 'copy-rich-text', label: 'Copy Rich Text', requiresNote: true },
  { id: 'open-settings', label: 'Open Settings' },
]

interface CommandPaletteProps {
  mode: PaletteMode
  selectedNoteId: string | null
  onClose: () => void
  onOpenNote: (id: string) => void | Promise<void>
  onRunCommand: (command: UiCommand) => void
  onTogglePreview: () => void
  onToggleChatPanel: () => void
  onOpenSettings: () => void
}

export function CommandPalette({
  mode,
  selectedNoteId,
  onClose,
  onOpenNote,
  onRunCommand,
  onTogglePreview,
  onToggleChatPanel,
  onOpenSettings,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input on mount
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 10)
    return () => window.clearTimeout(timer)
  }, [])

  const [result, setResult] = useState<{ query: string; notes: Note[]; error: string } | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState('')
  useEffect(() => {
    if (mode !== 'quick-open') return
    let active = true
    const timer = window.setTimeout(() => {
      void notesService.page({ query: query.trim(), limit: 30 }).then(
        (page) => {
          if (active) setResult({ query, notes: page.notes, error: '' })
        },
        () => {
          if (active) setResult({ query, notes: [], error: 'Could not search notes. Try again.' })
        },
      )
    }, 180)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [mode, query])
  const loading = mode === 'quick-open' && result?.query !== query
  const noteResults = result?.query === query ? result.notes : []
  const searchError = mode === 'quick-open' && result?.query === query ? result.error : ''
  const openNote = async (id: string) => {
    if (opening) return
    setOpening(true)
    setOpenError('')
    try {
      await onOpenNote(id)
      onClose()
    } catch {
      setOpenError('Could not open this note. Your current draft is preserved.')
    } finally {
      setOpening(false)
    }
  }

  // Filtered command results (commands mode)
  const commandResults = useMemo(() => {
    if ('commands' !== mode) return []
    const q = query.toLowerCase().trim()
    let filtered = COMMANDS
    if (q) {
      filtered = COMMANDS.filter((c) => c.label.toLowerCase().includes(q))
    }
    // Filter out commands that require a note when none is selected
    return filtered.filter((c) => !c.requiresNote || selectedNoteId)
  }, [mode, query, selectedNoteId])

  const totalItems = 'quick-open' === mode ? noteResults.length : commandResults.length

  // Arrow key + Enter navigation
  const onKeyDown = (event: React.KeyboardEvent) => {
    if ('ArrowDown' === event.key) {
      event.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, totalItems))
    } else if ('ArrowUp' === event.key) {
      event.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + totalItems) % Math.max(1, totalItems))
    } else if ('Enter' === event.key) {
      event.preventDefault()
      activateSelected()
    } else if ('Escape' === event.key) {
      event.preventDefault()
      onClose()
    }
  }

  const activateSelected = () => {
    if ('quick-open' === mode) {
      const note = noteResults[selectedIndex]
      if (note) {
        void openNote(note.id)
      }
    } else {
      const cmd = commandResults[selectedIndex]
      if (cmd) {
        executeCommand(cmd)
        onClose()
      }
    }
  }

  const executeCommand = (cmd: PaletteCommand) => {
    switch (cmd.id) {
      case 'toggle-preview':
        onTogglePreview()
        break
      case 'toggle-chat-panel':
        onToggleChatPanel()
        break
      case 'open-settings':
        onOpenSettings()
        break
      default:
        onRunCommand(cmd.id as UiCommand)
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const items = listRef.current.children
    if (items[selectedIndex]) {
      items[selectedIndex].scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  return (
    <div className="modal-overlay palette-overlay" onClick={onClose}>
      <div
        className={`palette-container ${mode === 'quick-open' ? 'palette-quick-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'quick-open' ? 'Search notes' : 'Run a command'}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelectedIndex(0)
          }}
          onKeyDown={onKeyDown}
          placeholder={'quick-open' === mode ? 'Search notes...' : 'Run a command...'}
          aria-label={'quick-open' === mode ? 'Quick open notes' : 'Command palette'}
        />
        <div className="palette-results" ref={listRef} aria-busy={loading}>
          {loading && (
            <div className="palette-loading" role="status" aria-label="Searching notes">
              <span className="palette-spinner" aria-hidden="true" />
            </div>
          )}
          {'quick-open' === mode
            ? noteResults.map((note, index) => (
                <div
                  key={note.id}
                  className={`palette-item ${index === selectedIndex ? 'palette-item-selected' : ''}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    void openNote(note.id)
                  }}
                >
                  <div className="palette-item-title">{note.title ?? deriveNoteTitle(note.content)}</div>
                  <div className="palette-item-meta">
                    {note.tags.length > 0 && (
                      <span className="palette-item-tags">{note.tags.slice(0, 3).join(' ')}</span>
                    )}
                    <span className="palette-item-time">{formatRelativeTime(note.updatedAt)}</span>
                  </div>
                </div>
              ))
            : commandResults.map((cmd, index) => (
                <div
                  key={cmd.id}
                  className={`palette-item ${index === selectedIndex ? 'palette-item-selected' : ''}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    executeCommand(cmd)
                    onClose()
                  }}
                >
                  <span className="palette-item-title">{cmd.label}</span>
                  {cmd.shortcut && <span className="palette-item-shortcut">{cmd.shortcut}</span>}
                </div>
              ))}
          {opening && (
            <div className="palette-message" role="status">
              Opening…
            </div>
          )}
          {(openError || searchError) && (
            <div className="palette-message" role="alert">
              {openError || searchError}
            </div>
          )}
          {!loading && !searchError && !openError && totalItems === 0 && (
            <div className="palette-empty">{query.trim() ? 'No results' : 'No notes yet'}</div>
          )}
        </div>
      </div>
    </div>
  )
}
