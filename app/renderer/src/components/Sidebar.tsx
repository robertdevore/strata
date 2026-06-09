import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type React from 'react'
import type { Note, Project, ThemeMode } from '@shared/types'
import type { ActiveFilter } from '@renderer/src/domain/filtering'
import { deriveNoteTitle, formatRelativeTime } from '@renderer/src/domain/noteUtils'
import type { SidebarLayoutSettings, SidebarSectionId } from '@shared/sidebarLayout'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CircleChevronLeftIcon,
  CircleChevronRightIcon,
  CirclePlusIcon,
  CloseIcon,
  MoonIcon,
  PinFilledIcon,
  PinIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon,
} from './icons'
import { projectsService } from '@renderer/src/services/projectsService'

interface SidebarProps {
  notes: Note[]
  projects: Project[]
  selectedId: string | null
  activeFilter: ActiveFilter
  selectedTag: string | null
  searchQuery: string
  tags: Array<{ name: string; count: number }>
  showFiltersPanel: boolean
  sidebarCollapsed: boolean
  pinnedTags: string[]
  pinnedNotes: Array<{ id: string; note: Note | null; content: string }>
  onSearchChange: (value: string) => void
  onSelect: (id: string) => void
  onNewNote: () => void
  onOpenSettings: () => void
  onThemeToggle: () => void
  onToggleSidebar: () => void
  onOpenTagsModal: () => void
  onFilterChange: (value: ActiveFilter) => void
  onTagFilter: (tag: string | null) => void
  onStarToggle: (id: string) => void
  onArchiveToggle: (id: string) => void
  onDelete: (id: string) => void
  onSetNoteProject: (id: string, projectId: string | null) => void
  onPinTag: (tag: string) => void
  onUnpinTag: (tag: string) => void
  onReorderPinned: (tags: string[]) => void
  onPinNote: (id: string) => void
  onUnpinNote: (id: string) => void
  onReorderPinnedNotes: (ids: string[]) => void
  undoDeleteTitle: string | null
  onUndoDelete: () => void
  theme: ThemeMode
  sidebarLayout: SidebarLayoutSettings
}

interface MenuState {
  noteId: string
  x: number
  y: number
}

type MenuSubmenu = 'project' | null

export function Sidebar(props: SidebarProps) {
  const { pinnedTags, onReorderPinned } = props
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [projectCreateOpen, setProjectCreateOpen] = useState(false)
  const [projectCreateName, setProjectCreateName] = useState('')
  const [projectCreateStatus, setProjectCreateStatus] = useState('')
  const [isProjectCreateBusy, setIsProjectCreateBusy] = useState(false)
  const [tagsCollapsed, setTagsCollapsed] = useState(true)
  const [projectsCollapsedById, setProjectsCollapsedById] = useState<Record<string, boolean>>({})
  const [pinnedNotesCollapsed, setPinnedNotesCollapsed] = useState(false)
  const [notesCollapsed, setNotesCollapsed] = useState(false)
  const [draggedTag, setDraggedTag] = useState<string | null>(null)
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const [visibleCountsByKey, setVisibleCountsByKey] = useState<Record<string, number>>({})
  const [projectVisibleCountsById, setProjectVisibleCountsById] = useState<Record<string, number>>({})
  const [menuSubmenu, setMenuSubmenu] = useState<MenuSubmenu>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const visibleUnprojectedNotes = useMemo(() => props.notes.filter((note) => !note.projectId), [props.notes])
  const selectedIndex = useMemo(
    () => visibleUnprojectedNotes.findIndex((note) => note.id === props.selectedId),
    [visibleUnprojectedNotes, props.selectedId],
  )
  const pinnedNoteIds = useMemo(() => props.pinnedNotes.map((entry) => entry.id), [props.pinnedNotes])
  const pinnedNoteIdSet = useMemo(() => new Set(pinnedNoteIds), [pinnedNoteIds])
  const active_list_key = useMemo(
    () =>
      `${props.activeFilter}|${props.searchQuery}|${props.selectedTag ?? ''}|${visibleUnprojectedNotes.length}`,
    [props.activeFilter, props.searchQuery, props.selectedTag, visibleUnprojectedNotes.length],
  )
  const visibleCount = visibleCountsByKey[active_list_key] ?? 50
  const sidebarSearch = props.searchQuery.trim().toLowerCase()
  const hasSidebarSearch = sidebarSearch.length > 0
  const filteredPinnedTags = useMemo(
    () =>
      hasSidebarSearch ? pinnedTags.filter((tag) => tag.toLowerCase().includes(sidebarSearch)) : pinnedTags,
    [hasSidebarSearch, pinnedTags, sidebarSearch],
  )
  const filteredPinnedNotes = useMemo(
    () =>
      hasSidebarSearch
        ? props.pinnedNotes.filter((entry) => {
            const haystack = [
              deriveNoteTitle(entry.content),
              entry.content,
              (entry.note?.tags ?? []).join(' '),
            ]
              .join(' ')
              .toLowerCase()
            return haystack.includes(sidebarSearch)
          })
        : props.pinnedNotes,
    [hasSidebarSearch, props.pinnedNotes, sidebarSearch],
  )
  const visibleNotesByProject = useMemo(() => {
    const grouped = new Map<string, Note[]>()
    for (const note of props.notes) {
      if (!note.projectId) continue
      const current = grouped.get(note.projectId) ?? []
      current.push(note)
      grouped.set(note.projectId, current)
    }
    return grouped
  }, [props.notes])
  const sectionOrderIndex = useMemo(() => {
    return Object.fromEntries(
      props.sidebarLayout.sectionOrder.map((section_id, index) => [section_id, index]),
    ) as Record<SidebarSectionId, number>
  }, [props.sidebarLayout.sectionOrder])
  const togglePinnedNote = (note_id: string) => {
    if (pinnedNoteIdSet.has(note_id)) {
      props.onUnpinNote(note_id)
      return
    }
    props.onPinNote(note_id)
  }

  const openProjectCreateModal = () => {
    setProjectCreateStatus('')
    setProjectCreateOpen(true)
  }

  useEffect(() => {
    const focusSearch = () => {
      window.setTimeout(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }, 0)
    }
    const openProjectCreate = () => openProjectCreateModal()

    window.addEventListener('strata:focus-search', focusSearch)
    window.addEventListener('strata:open-project-create', openProjectCreate)
    return () => {
      window.removeEventListener('strata:focus-search', focusSearch)
      window.removeEventListener('strata:open-project-create', openProjectCreate)
    }
  }, [])

  const closeProjectCreateModal = () => {
    if (isProjectCreateBusy) return
    setProjectCreateOpen(false)
    setProjectCreateName('')
    setProjectCreateStatus('')
  }

  const createProject = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const name = projectCreateName.trim()
    if (!name) {
      setProjectCreateStatus('Project name is required.')
      return
    }
    setIsProjectCreateBusy(true)
    setProjectCreateStatus('')
    try {
      await projectsService.create(name)
      setProjectCreateName('')
      setProjectCreateOpen(false)
    } catch (error) {
      setProjectCreateStatus(error instanceof Error ? error.message : 'Failed to create project.')
    } finally {
      setIsProjectCreateBusy(false)
    }
  }

  // Auto-load more notes on scroll
  const onScrollNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 80 // px from bottom to trigger load
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      setVisibleCountsByKey((prev) => {
        const current_count = prev[active_list_key] ?? 50
        const next_count = Math.min(current_count + 50, visibleUnprojectedNotes.length)
        if (next_count === current_count) return prev
        return {
          ...prev,
          [active_list_key]: next_count,
        }
      })
    }
  }, [active_list_key, visibleUnprojectedNotes.length])

  const visibleNotes = visibleUnprojectedNotes.slice(0, visibleCount)
  const hasMore = visibleCount < visibleUnprojectedNotes.length

  const loadMoreProjectNotes = (projectId: string) => {
    setProjectVisibleCountsById((current) => {
      const current_count = current[projectId] ?? 6
      return {
        ...current,
        [projectId]: Math.min(current_count + 6, Number.MAX_SAFE_INTEGER),
      }
    })
  }

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenu(null)
        setMenuSubmenu(null)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [menu])

  const clearDragState = () => {
    setDraggedTag(null)
    setDraggedNoteId(null)
  }

  const closeMenu = () => {
    setMenu(null)
    setMenuSubmenu(null)
  }

  const startNoteDrag = (event: React.DragEvent<HTMLElement>, noteId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', noteId)
    setDraggedNoteId(noteId)
  }

  const startTagDrag = (event: React.DragEvent<HTMLElement>, tag: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', tag)
    setDraggedTag(tag)
  }

  const reorderPinnedTags = (targetTag: string | null) => {
    if (!draggedTag) return
    if (targetTag === draggedTag) {
      setDraggedTag(null)
      return
    }
    const current = pinnedTags
    const next = current.filter((tag) => tag !== draggedTag)
    const insert_index = null === targetTag ? next.length : next.indexOf(targetTag)
    if (insert_index >= 0) {
      next.splice(insert_index, 0, draggedTag)
    } else {
      next.push(draggedTag)
    }
    onReorderPinned(next)
    setDraggedTag(null)
  }

  const reorderPinnedNotes = (targetNoteId: string | null) => {
    if (!draggedNoteId) return
    if (targetNoteId === draggedNoteId) {
      setDraggedNoteId(null)
      return
    }
    const current = props.pinnedNotes.map((entry) => entry.id)
    const next = current.filter((id) => id !== draggedNoteId)
    const insert_index = null === targetNoteId ? next.length : next.indexOf(targetNoteId)
    if (-1 === insert_index) {
      next.push(draggedNoteId)
    } else {
      next.splice(insert_index, 0, draggedNoteId)
    }
    props.onReorderPinnedNotes(next)
    setDraggedNoteId(null)
  }

  const toggleProjectCollapsed = (projectId: string) => {
    setProjectsCollapsedById((current) => ({
      ...current,
      [projectId]: undefined === current[projectId] ? false : !current[projectId],
    }))
  }

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (0 === visibleUnprojectedNotes.length) return
    if ('ArrowDown' === event.key) {
      event.preventDefault()
      const next = selectedIndex < visibleUnprojectedNotes.length - 1 ? selectedIndex + 1 : 0
      props.onSelect(visibleUnprojectedNotes[next].id)
    }
    if ('ArrowUp' === event.key) {
      event.preventDefault()
      const next = selectedIndex > 0 ? selectedIndex - 1 : visibleUnprojectedNotes.length - 1
      props.onSelect(visibleUnprojectedNotes[next].id)
    }
    if ('Enter' === event.key && props.selectedId) {
      props.onSelect(props.selectedId)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="app-title-row">
          {!props.sidebarCollapsed && (
            <div className="app-title-left">
              <p className="app-title">STRATA</p>
            </div>
          )}
          <div className="app-title-actions">
            <button
              className="icon-button sidebar-collapse-button sidebar-new-note-btn"
              onClick={props.onNewNote}
              title="New Note"
            >
              <CirclePlusIcon size={18} />
            </button>
            <button
              className="icon-button sidebar-collapse-button sidebar-toggle-btn"
              onClick={props.onToggleSidebar}
              title={props.sidebarCollapsed ? 'Open Sidebar' : 'Close Sidebar'}
            >
              {props.sidebarCollapsed ? <CircleChevronRightIcon /> : <CircleChevronLeftIcon />}
            </button>
          </div>
        </div>
      </div>
      {!props.sidebarCollapsed && (
        <div className="sidebar-scroll" ref={scrollRef} onScroll={onScrollNearBottom}>
          {props.sidebarLayout.showSearch && (
            <div className="sidebar-search-row">
              <input
                ref={searchInputRef}
                className="search-input sidebar-search-input"
                type="search"
                value={props.searchQuery}
                onChange={(event) => props.onSearchChange(event.target.value)}
                placeholder="Search..."
                aria-label="Search"
              />
            </div>
          )}
          {/* Tags — collapsible, pinned-only shortlist */}
          {props.sidebarLayout.sectionVisibility.tags && (
            <div className="tags-section" style={{ order: sectionOrderIndex.tags }}>
              <div className="tags-header-row">
                <button
                  type="button"
                  className="tags-header-toggle"
                  onClick={() => setTagsCollapsed((v) => !v)}
                  title={tagsCollapsed ? 'Show tags' : 'Hide tags'}
                  aria-expanded={!tagsCollapsed}
                >
                  <span className="tags-label">Tags</span>
                  <span className="tags-collapse-btn" aria-hidden="true">
                    {tagsCollapsed ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
                  </span>
                </button>
              </div>
              {!tagsCollapsed && filteredPinnedTags.length > 0 && (
                <div className="pinned-tags">
                  {filteredPinnedTags.map((tag) => (
                    <button
                      key={tag}
                      draggable
                      className={`tag-filter tag-pinned ${props.selectedTag === tag ? 'tag-filter-active' : ''}`}
                      onClick={() => props.onTagFilter(tag)}
                      onDragStart={(event) => startTagDrag(event, tag)}
                      onDragOver={(e) => {
                        if (!draggedTag) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={() => {
                        if (!draggedTag) return
                        reorderPinnedTags(tag)
                      }}
                      onDragEnd={clearDragState}
                    >
                      <span className="tag-filter-label">{tag}</span>
                      <span className="tag-count-row">
                        <span className="tag-hotkey">⌘{pinnedTags.indexOf(tag) + 1}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!tagsCollapsed && 0 === filteredPinnedTags.length && (
                <div className="sidebar-section-empty">
                  {hasSidebarSearch ? 'No pinned tags match this search.' : 'No pinned tags yet.'}
                </div>
              )}
              {!tagsCollapsed && 0 === pinnedTags.length && !hasSidebarSearch && (
                <button className="pinned-tags-empty-link" type="button" onClick={props.onOpenTagsModal}>
                  View tags
                </button>
              )}
            </div>
          )}
          {props.sidebarLayout.sectionVisibility.projects && (
            <div className="projects-section" style={{ order: sectionOrderIndex.projects }}>
              <div className="tags-header-row project-header-row">
                <span className="tags-label">Projects</span>
                <div className="project-header-actions">
                  <button
                    type="button"
                    className="tags-collapse-btn project-add-button"
                    onClick={openProjectCreateModal}
                    title="New Project"
                    aria-label="New Project"
                  >
                    <CirclePlusIcon size={14} />
                  </button>
                </div>
              </div>
              {props.projects.map((project) => {
                const project_notes = visibleNotesByProject.get(project.id) ?? []
                const visible_project_notes = [
                  ...project_notes.filter((note) => pinnedNoteIdSet.has(note.id)),
                  ...project_notes.filter((note) => !pinnedNoteIdSet.has(note.id)),
                ]
                const visible_project_count = projectVisibleCountsById[project.id] ?? 6
                const paged_project_notes = visible_project_notes.slice(0, visible_project_count)
                const has_more_project_notes = visible_project_count < visible_project_notes.length
                const project_collapsed =
                  undefined === projectsCollapsedById[project.id] ? true : projectsCollapsedById[project.id]
                const project_expanded = hasSidebarSearch || !project_collapsed
                const show_project = visible_project_notes.length > 0 || !hasSidebarSearch
                if (!show_project) return null

                return (
                  <div
                    key={project.id}
                    className={`project-block ${draggedNoteId ? 'project-block-drop-active' : ''}`}
                    onDragOver={(event) => {
                      if (!draggedNoteId) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(event) => {
                      if (!draggedNoteId) return
                      event.preventDefault()
                      props.onSetNoteProject(draggedNoteId, project.id)
                      setDraggedNoteId(null)
                    }}
                  >
                    <div className="project-header-row">
                      <button
                        type="button"
                        className="tags-header-toggle project-header-toggle"
                        onClick={(event) => {
                          if (draggedNoteId) {
                            event.preventDefault()
                            return
                          }
                          toggleProjectCollapsed(project.id)
                        }}
                        title={project_collapsed ? `Show ${project.name}` : `Hide ${project.name}`}
                        aria-expanded={project_expanded}
                      >
                        <span className="project-label-wrap">
                          <span className="tags-label project-label">{project.name}</span>
                          <span className="project-count">{visible_project_notes.length}</span>
                        </span>
                        <span className="tags-collapse-btn" aria-hidden="true">
                          {project_expanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                        </span>
                      </button>
                    </div>
                    {project_expanded && (
                      <div
                        className={`project-notes ${draggedNoteId ? 'project-notes-drop-active' : ''}`}
                        onDragOver={(event) => {
                          if (!draggedNoteId) return
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(event) => {
                          if (!draggedNoteId) return
                          event.preventDefault()
                          props.onSetNoteProject(draggedNoteId, project.id)
                          setDraggedNoteId(null)
                        }}
                      >
                        {0 === visible_project_notes.length ? (
                          <div className="sidebar-section-empty project-empty-state">
                            No notes yet in this project. Drag a note here or import a folder of markdown
                            files.
                          </div>
                        ) : (
                          paged_project_notes.map((note) => (
                            <div
                              key={note.id}
                              className={`note-row project-note-row ${props.selectedId === note.id ? 'note-row-active' : ''} ${draggedNoteId === note.id ? 'note-row-dragging' : ''}`}
                              role="button"
                              tabIndex={-1}
                              draggable
                              onClick={() => props.onSelect(note.id)}
                              onDragStart={(event) => startNoteDrag(event, note.id)}
                              onDragEnd={clearDragState}
                              onContextMenu={(event) => {
                                event.preventDefault()
                                setMenu({ noteId: note.id, x: event.clientX, y: event.clientY })
                                setMenuSubmenu(null)
                              }}
                            >
                              <div className="note-row-title-wrap">
                                <span className="note-row-title">{deriveNoteTitle(note.content)}</span>
                                <span className="note-row-time">{formatRelativeTime(note.updatedAt)}</span>
                                <div className="note-row-icons">
                                  <button
                                    type="button"
                                    className={`note-row-pin ${pinnedNoteIdSet.has(note.id) ? 'pin-active' : ''}`}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      togglePinnedNote(note.id)
                                    }}
                                    title={pinnedNoteIdSet.has(note.id) ? 'Unpin Note' : 'Pin Note'}
                                  >
                                    {pinnedNoteIdSet.has(note.id) ? (
                                      <PinFilledIcon size={14} />
                                    ) : (
                                      <PinIcon size={14} />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    className="note-row-delete"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      props.onDelete(note.id)
                                    }}
                                    title="Delete Note"
                                  >
                                    <TrashIcon size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                        {has_more_project_notes && (
                          <button
                            type="button"
                            className="project-view-more"
                            onClick={() => loadMoreProjectNotes(project.id)}
                          >
                            View more
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {props.sidebarLayout.sectionVisibility.pinned && (
            <div className="pinned-notes-section" style={{ order: sectionOrderIndex.pinned }}>
              <div className="tags-header-row">
                <button
                  className="tags-header-toggle"
                  onClick={() => setPinnedNotesCollapsed((v) => !v)}
                  title={pinnedNotesCollapsed ? 'Show pinned notes' : 'Hide pinned notes'}
                  aria-expanded={!pinnedNotesCollapsed}
                >
                  <span className="tags-label">Pinned</span>
                  <span className="tags-collapse-btn" aria-hidden="true">
                    {pinnedNotesCollapsed ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
                  </span>
                </button>
              </div>
              {!pinnedNotesCollapsed && (
                <div
                  className={`pinned-notes ${draggedNoteId ? 'pinned-notes-drop-active' : ''}`}
                  onDragOver={(event) => {
                    if (!draggedNoteId) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    if (!draggedNoteId) return
                    event.preventDefault()
                    reorderPinnedNotes(null)
                  }}
                >
                  {0 === filteredPinnedNotes.length ? (
                    <div className="pinned-notes-empty">
                      {hasSidebarSearch ? (
                        <>
                          <p className="pinned-notes-empty-title">No pinned notes match this search</p>
                          <p className="pinned-notes-empty-copy">
                            Try a different phrase or clear the search to see every pinned note again.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="pinned-notes-empty-title">No pinned notes yet</p>
                          <p className="pinned-notes-empty-copy">
                            Drag a note here or pin the one you’re reading right now.
                          </p>
                          <button
                            className="primary-button pinned-notes-empty-cta"
                            type="button"
                            onClick={() => {
                              if (props.selectedId) props.onPinNote(props.selectedId)
                            }}
                            disabled={!props.selectedId}
                          >
                            {props.selectedId ? 'Pin selected note' : 'Select a note first'}
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    filteredPinnedNotes.map((entry) => (
                      <div
                        key={entry.id}
                        className={`note-row pinned-note-row ${props.selectedId === entry.id ? 'note-row-active' : ''} ${draggedNoteId === entry.id ? 'note-row-dragging' : ''}`}
                        role="button"
                        tabIndex={-1}
                        draggable
                        onClick={() => props.onSelect(entry.id)}
                        onDragStart={(event) => startNoteDrag(event, entry.id)}
                        onDragEnd={clearDragState}
                        onDragOver={(event) => {
                          if (!draggedNoteId) return
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(event) => {
                          if (!draggedNoteId) return
                          event.preventDefault()
                          reorderPinnedNotes(entry.id)
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setMenu({ noteId: entry.id, x: event.clientX, y: event.clientY })
                          setMenuSubmenu(null)
                        }}
                      >
                        <div className="note-row-title-wrap pinned-note-title-wrap">
                          <span className="note-row-title">{deriveNoteTitle(entry.content)}</span>
                          <span className="note-row-time">
                            {formatRelativeTime(entry.note?.updatedAt ?? '')}
                          </span>
                          <div className="note-row-icons">
                            <button
                              type="button"
                              className="pinned-note-unpin"
                              onClick={(event) => {
                                event.stopPropagation()
                                props.onUnpinNote(entry.id)
                              }}
                              title="Unpin Note"
                            >
                              <PinFilledIcon size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div
                    className="pinned-notes-drop-zone"
                    onDragOver={(event) => {
                      if (!draggedNoteId) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(event) => {
                      if (!draggedNoteId) return
                      event.preventDefault()
                      reorderPinnedNotes(null)
                    }}
                  />
                </div>
              )}
            </div>
          )}
          {props.sidebarLayout.sectionVisibility.notes && (
            <div className="notes-section" style={{ order: sectionOrderIndex.notes }}>
              <div className="tags-header-row">
                <button
                  className="tags-header-toggle"
                  onClick={() => setNotesCollapsed((v) => !v)}
                  title={notesCollapsed ? 'Show notes' : 'Hide notes'}
                  aria-expanded={!notesCollapsed}
                >
                  <span className="tags-label">Notes</span>
                  <span className="tags-collapse-btn" aria-hidden="true">
                    {notesCollapsed ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
                  </span>
                </button>
              </div>
              {!notesCollapsed && (
                <div className="notes-list" tabIndex={0} onKeyDown={onListKeyDown}>
                  {0 === visibleNotes.length ? (
                    <div className="sidebar-section-empty">
                      {hasSidebarSearch ? 'No notes match this search.' : 'No notes yet.'}
                    </div>
                  ) : (
                    <>
                      {visibleNotes.map((note) => (
                        <div
                          key={note.id}
                          className={`note-row ${props.selectedId === note.id ? 'note-row-active' : ''} ${draggedNoteId === note.id ? 'note-row-dragging' : ''}`}
                          role="button"
                          tabIndex={-1}
                          draggable
                          onClick={() => props.onSelect(note.id)}
                          onDragStart={(event) => startNoteDrag(event, note.id)}
                          onDragEnd={clearDragState}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            setMenu({ noteId: note.id, x: event.clientX, y: event.clientY })
                            setMenuSubmenu(null)
                          }}
                        >
                          <div className="note-row-title-wrap">
                            <span className="note-row-title">{deriveNoteTitle(note.content)}</span>
                            <span className="note-row-time">{formatRelativeTime(note.updatedAt)}</span>
                            <div className="note-row-icons">
                              <button
                                type="button"
                                className={`note-row-pin ${pinnedNoteIdSet.has(note.id) ? 'pin-active' : ''}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  togglePinnedNote(note.id)
                                }}
                                title={pinnedNoteIdSet.has(note.id) ? 'Unpin Note' : 'Pin Note'}
                              >
                                {pinnedNoteIdSet.has(note.id) ? (
                                  <PinFilledIcon size={14} />
                                ) : (
                                  <PinIcon size={14} />
                                )}
                              </button>
                              <button
                                type="button"
                                className="note-row-delete"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  props.onDelete(note.id)
                                }}
                                title="Delete Note"
                              >
                                <TrashIcon size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {hasMore && (
                        <div className="sidebar-load-more">
                          {visibleCount} of {props.notes.length} notes · scroll for more
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!props.sidebarCollapsed && props.undoDeleteTitle && (
        <div className="sidebar-undo-toast" role="status" aria-live="polite">
          <span className="sidebar-undo-text">Deleted “{props.undoDeleteTitle}”</span>
          <button className="ghost-button sidebar-undo-button" onClick={props.onUndoDelete}>
            Undo
          </button>
        </div>
      )}
      {!props.sidebarCollapsed && (
        <div className="sidebar-bottom">
          <div className="bottom-actions">
            <button className="icon-button" onClick={props.onOpenSettings} title="Settings">
              <SettingsIcon />
            </button>
            <button
              className="icon-button sidebar-theme-toggle"
              onClick={props.onThemeToggle}
              title="Toggle Theme"
            >
              {'dark' === props.theme ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
        </div>
      )}
      {projectCreateOpen && (
        <div className="modal-overlay" onClick={closeProjectCreateModal}>
          <div
            className="modal-card sidebar-project-create-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button modal-close-button"
              onClick={closeProjectCreateModal}
              aria-label="Close new project"
              title="Close new project"
            >
              <CloseIcon />
            </button>
            <h3>New Project</h3>
            <p className="tags-label" style={{ lineHeight: 1.45 }}>
              Create a project to group related notes together.
            </p>
            <form className="sidebar-project-create-form" onSubmit={(event) => void createProject(event)}>
              <label className="project-create-field">
                <span>Project Name</span>
                <input
                  type="text"
                  value={projectCreateName}
                  onChange={(event) => setProjectCreateName(event.target.value)}
                  placeholder="Work, Research, Personal"
                  spellCheck={false}
                />
              </label>
              {projectCreateStatus && <p className="settings-inline-status">{projectCreateStatus}</p>}
              <div className="modal-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={closeProjectCreateModal}
                  disabled={isProjectCreateBusy}
                >
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={isProjectCreateBusy}>
                  <CirclePlusIcon size={16} />
                  <span>Create</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {menu && (
        <div className="context-menu" ref={menuRef} style={{ left: menu.x, top: menu.y }}>
          <button
            onClick={() => {
              props.onSelect(menu.noteId)
              closeMenu()
            }}
          >
            Open Note
          </button>
          <div
            className="context-menu-submenu-wrap"
            onMouseEnter={() => setMenuSubmenu('project')}
            onMouseLeave={() => setMenuSubmenu(null)}
          >
            <button
              type="button"
              className={`context-menu-parent ${'project' === menuSubmenu ? 'context-menu-parent-active' : ''}`}
              onClick={() => setMenuSubmenu('project' === menuSubmenu ? null : 'project')}
            >
              Add to Project
            </button>
            {'project' === menuSubmenu && (
              <div className="context-submenu">
                {props.projects.length > 0 ? (
                  <>
                    <button
                      onClick={() => {
                        props.onSetNoteProject(menu.noteId, null)
                        closeMenu()
                      }}
                    >
                      No Project
                    </button>
                    {props.projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => {
                          props.onSetNoteProject(menu.noteId, project.id)
                          closeMenu()
                        }}
                      >
                        {project.name}
                      </button>
                    ))}
                  </>
                ) : (
                  <button disabled>No projects yet</button>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              if (pinnedNoteIdSet.has(menu.noteId)) {
                props.onUnpinNote(menu.noteId)
              } else {
                props.onPinNote(menu.noteId)
              }
              closeMenu()
            }}
          >
            {pinnedNoteIdSet.has(menu.noteId) ? 'Unpin Note' : 'Pin Note'}
          </button>
          <button
            onClick={() => {
              props.onStarToggle(menu.noteId)
              closeMenu()
            }}
          >
            Star / Unstar
          </button>
          <button
            onClick={() => {
              props.onArchiveToggle(menu.noteId)
              closeMenu()
            }}
          >
            Archive / Unarchive
          </button>
          <button
            className="danger"
            onClick={() => {
              props.onDelete(menu.noteId)
              closeMenu()
            }}
          >
            Delete
          </button>
        </div>
      )}
    </aside>
  )
}
