import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Project, Settings } from '@shared/types'
import { DEFAULT_HOTKEYS } from '@shared/hotkeys'
import type { HotkeyAction, HotkeysSettings } from '@shared/hotkeys'
import {
  get_home_tile_option,
  HOME_TILE_OPTIONS,
  normalize_home_tiles,
  type HomeTileAction,
} from '@shared/homeTiles'
import {
  DEFAULT_SIDEBAR_LAYOUT,
  normalize_sidebar_layout,
  type SidebarLayoutSettings,
  type SidebarSectionId,
} from '@shared/sidebarLayout'
import { CirclePlusIcon, CloseIcon, MenuIcon, TrashIcon } from './icons'
import { projectsService } from '@renderer/src/services/projectsService'

interface SettingsModalProps {
  open: boolean
  settings: Settings
  projects: Project[]
  projectNoteCounts: Record<string, number>
  onClose: () => void
  onUpdate: (patch: Partial<Settings>) => void
  onProjectsChanged: () => Promise<void>
  onCreateBackup: () => Promise<{ directory: string; createdAt: string }>
  onOpenBackupsFolder: () => Promise<void>
  onListBackups: () => Promise<Array<{ name: string; createdAt: string; sizeBytes: number }>>
}

type SettingsTab = 'general' | 'home' | 'sidebar' | 'projects' | 'ai' | 'backups' | 'hotkeys'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'home', label: 'Home' },
  { id: 'sidebar', label: 'Sidebar' },
  { id: 'projects', label: 'Projects' },
  { id: 'ai', label: 'AI' },
  { id: 'backups', label: 'Backups' },
  { id: 'hotkeys', label: 'Hotkeys' },
]

const CHEAP_PROVIDERS = [
  { value: 'deepseek-flash', label: 'DeepSeek V4 Flash' },
  { value: 'kimi', label: 'Kimi / Moonshot' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom', label: 'Custom OpenAI-compatible' },
]

const PREMIUM_PROVIDERS = [
  { value: 'openai', label: 'OpenAI (Responses API)' },
  { value: 'deepseek-pro', label: 'DeepSeek V4 Pro' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom', label: 'Custom OpenAI-compatible' },
]

const HOTKEY_FIELDS: Array<{ id: HotkeyAction; label: string }> = [
  { id: 'quickOpen', label: 'Quick Open' },
  { id: 'commandPalette', label: 'Command Palette' },
  { id: 'newNote', label: 'New Note' },
  { id: 'editNoteTags', label: 'Edit Note Tags' },
  { id: 'allTagsModal', label: 'All Tags' },
  { id: 'togglePreview', label: 'Toggle Preview Panel' },
  { id: 'findOrSearch', label: 'Find in Note / Focus Search' },
  { id: 'toggleFilters', label: 'Toggle Filters Panel' },
  { id: 'saveNote', label: 'Save Note' },
  { id: 'toggleStar', label: 'Toggle Star' },
  { id: 'toggleArchive', label: 'Toggle Archive' },
  { id: 'copyRichText', label: 'Copy Rich Text' },
  { id: 'deleteNote', label: 'Delete Note' },
  { id: 'toggleSidebar', label: 'Toggle Sidebar' },
  { id: 'toggleSettings', label: 'Open Settings' },
  { id: 'relatedNotes', label: 'Related Notes' },
  { id: 'navigateBack', label: 'Navigate Back' },
  { id: 'navigateForward', label: 'Navigate Forward' },
]

export function SettingsModal({
  open,
  settings,
  projects,
  projectNoteCounts,
  onClose,
  onUpdate,
  onProjectsChanged,
  onCreateBackup,
  onOpenBackupsFolder,
  onListBackups,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('general')
  const [backup_status, set_backup_status] = useState('')
  const [is_creating_backup, set_is_creating_backup] = useState(false)
  const [is_opening_backup_folder, set_is_opening_backup_folder] = useState(false)
  const [show_advanced, set_show_advanced] = useState(false)
  const [backup_list, set_backup_list] = useState<
    Array<{ name: string; createdAt: string; sizeBytes: number }>
  >([])
  const [project_name_drafts, set_project_name_drafts] = useState<Record<string, string>>({})
  const [new_project_name, set_new_project_name] = useState('')
  const [project_action_status, set_project_action_status] = useState('')
  const [is_project_action_busy, set_is_project_action_busy] = useState(false)
  const [sidebar_layout_draft, set_sidebar_layout_draft] =
    useState<SidebarLayoutSettings>(DEFAULT_SIDEBAR_LAYOUT)
  const [dragged_sidebar_section, set_dragged_sidebar_section] = useState<SidebarSectionId | null>(null)
  const [project_order_draft, set_project_order_draft] = useState<string[]>([])
  const [dragged_project_id, set_dragged_project_id] = useState<string | null>(null)

  const format_backup_time = (value: string | null): string => {
    if (!value) return 'Never'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString()
  }

  const format_backup_size = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  useEffect(() => {
    if (open && 'backups' === tab) {
      void onListBackups()
        .then(set_backup_list)
        .catch(() => set_backup_list([]))
    }
  }, [open, tab, onListBackups])

  useEffect(() => {
    if (!open) return
    set_project_name_drafts(Object.fromEntries(projects.map((project) => [project.id, project.name])))
    set_project_order_draft(projects.map((project) => project.id))
    set_new_project_name('')
    set_project_action_status('')
    set_sidebar_layout_draft(normalize_sidebar_layout(settings.sidebarLayout))
    set_dragged_sidebar_section(null)
    set_dragged_project_id(null)
  }, [open, projects, settings.sidebarLayout])

  if (!open) return null

  const ai_routing_mode = settings.aiRoutingMode || 'auto'
  const ai_cheap_provider = settings.aiCheapProvider || 'deepseek-flash'
  const ai_premium_provider = settings.aiPremiumProvider || 'openai'
  const resolved_hotkeys: HotkeysSettings = { ...DEFAULT_HOTKEYS, ...(settings.hotkeys ?? {}) }
  const resolved_home_tiles = normalize_home_tiles(settings.homeTiles)
  const sidebar_section_meta: Record<SidebarSectionId, { label: string; description: string }> = {
    tags: {
      label: 'Tags',
      description: 'Show the pinned tags section for quick filtering.',
    },
    projects: {
      label: 'Projects',
      description: 'Show project groups and their notes in the sidebar.',
    },
    pinned: {
      label: 'Pinned',
      description: 'Show pinned notes above the main note list.',
    },
    notes: {
      label: 'Notes',
      description: 'Show the main note list for browsing everything else.',
    },
  }

  const ordered_projects =
    project_order_draft.length > 0
      ? project_order_draft
          .map((project_id) => projects.find((project) => project.id === project_id))
          .filter((project): project is Project => Boolean(project))
      : projects

  const update_hotkey = (id: HotkeyAction, value: string) => {
    onUpdate({ hotkeys: { ...resolved_hotkeys, [id]: value } })
  }

  const update_home_tile = (index: number, action: HomeTileAction) => {
    onUpdate({
      homeTiles: resolved_home_tiles.map((tile, tile_index) => (tile_index === index ? { action } : tile)),
    })
  }

  const update_sidebar_layout = (next_layout: SidebarLayoutSettings) => {
    set_sidebar_layout_draft(next_layout)
    onUpdate({ sidebarLayout: next_layout })
  }

  const reorder_sidebar_section = (target: SidebarSectionId) => {
    if (!dragged_sidebar_section || target === dragged_sidebar_section) {
      set_dragged_sidebar_section(null)
      return
    }
    const current_order = sidebar_layout_draft.sectionOrder.filter(
      (section) => section !== dragged_sidebar_section,
    )
    const target_index = current_order.indexOf(target)
    if (target_index < 0) {
      set_dragged_sidebar_section(null)
      return
    }
    current_order.splice(target_index, 0, dragged_sidebar_section)
    update_sidebar_layout({
      ...sidebar_layout_draft,
      sectionOrder: current_order,
    })
    set_dragged_sidebar_section(null)
  }

  const reorder_projects = async (target_project_id: string) => {
    if (!dragged_project_id || target_project_id === dragged_project_id) {
      set_dragged_project_id(null)
      return
    }
    const current_order = (
      project_order_draft.length > 0 ? project_order_draft : projects.map((project) => project.id)
    ).filter((project_id) => projects.some((project) => project.id === project_id))
    const next_order = current_order.filter((project_id) => project_id !== dragged_project_id)
    const insert_index = next_order.indexOf(target_project_id)
    if (insert_index < 0) {
      next_order.push(dragged_project_id)
    } else {
      next_order.splice(insert_index, 0, dragged_project_id)
    }
    set_project_order_draft(next_order)
    set_dragged_project_id(null)
    set_is_project_action_busy(true)
    set_project_action_status('')
    try {
      await projectsService.reorder(next_order)
      await refresh_projects()
    } catch (error) {
      set_project_action_status(error instanceof Error ? error.message : 'Failed to reorder projects.')
    } finally {
      set_is_project_action_busy(false)
    }
  }

  const refresh_projects = async (): Promise<void> => {
    await onProjectsChanged()
  }

  const create_project = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const name = new_project_name.trim()
    if (!name) {
      set_project_action_status('Project name is required.')
      return
    }
    set_is_project_action_busy(true)
    set_project_action_status('')
    try {
      await projectsService.create(name)
      set_new_project_name('')
      await refresh_projects()
    } catch (error) {
      set_project_action_status(error instanceof Error ? error.message : 'Failed to create project.')
    } finally {
      set_is_project_action_busy(false)
    }
  }

  const rename_project = async (project_id: string) => {
    const next_name = (project_name_drafts[project_id] ?? '').trim()
    if (!next_name) {
      set_project_action_status('Project name is required.')
      return
    }
    const current = projects.find((project) => project.id === project_id)
    if (current && current.name === next_name) return
    set_is_project_action_busy(true)
    set_project_action_status('')
    try {
      const updated = await projectsService.update(project_id, next_name)
      if (!updated) {
        set_project_action_status('That project could not be renamed.')
        return
      }
      await refresh_projects()
    } catch (error) {
      set_project_action_status(error instanceof Error ? error.message : 'Failed to rename project.')
    } finally {
      set_is_project_action_busy(false)
    }
  }

  const delete_project = async (project: Project) => {
    const confirmed = window.confirm(
      `Delete project "${project.name}"? Notes will stay in Strata but will be unassigned from the project.`,
    )
    if (!confirmed) return
    set_is_project_action_busy(true)
    set_project_action_status('')
    try {
      const deleted = await projectsService.delete(project.id)
      if (!deleted) {
        set_project_action_status('That project could not be deleted.')
        return
      }
      await refresh_projects()
    } catch (error) {
      set_project_action_status(error instanceof Error ? error.message : 'Failed to delete project.')
    } finally {
      set_is_project_action_busy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-card settings-modal-card ${'home' === tab ? 'settings-modal-card-home' : ''} ${'projects' === tab ? 'settings-modal-card-projects' : ''} ${'sidebar' === tab ? 'settings-modal-card-sidebar' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button modal-close-button"
          onClick={onClose}
          aria-label="Close settings"
          title="Close settings"
        >
          <CloseIcon />
        </button>
        <h3>Settings</h3>

        {/* ---- Tab Bar ---- */}
        <div className="settings-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`settings-tab ${tab === t.id ? 'settings-tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="settings-tab-content">
          {/* ---- General Tab ---- */}
          {'general' === tab && (
            <>
              <label>
                Theme
                <select
                  value={settings.theme}
                  onChange={(event) => onUpdate({ theme: event.target.value as Settings['theme'] })}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </label>
              <label>
                Default View
                <select
                  value={settings.defaultView}
                  onChange={(event) =>
                    onUpdate({ defaultView: event.target.value as Settings['defaultView'] })
                  }
                >
                  <option value="all">All</option>
                  <option value="starred">Starred</option>
                </select>
              </label>
              <label>
                Sort Mode
                <select
                  value={settings.sortMode}
                  onChange={(event) => onUpdate({ sortMode: event.target.value as Settings['sortMode'] })}
                >
                  <option value="updated_desc">Last edited</option>
                  <option value="created_desc">Created date</option>
                  <option value="title_asc">Title</option>
                </select>
              </label>
            </>
          )}

          {/* ---- Home Tab ---- */}
          {'home' === tab && (
            <>
              <p className="tags-label" style={{ marginBottom: 10, lineHeight: 1.4 }}>
                These cards appear when the editor is empty. Pick the three actions that should greet new
                sessions.
              </p>
              <div className="home-settings-grid">
                {resolved_home_tiles.map((tile, index) => {
                  const option = get_home_tile_option(tile.action)
                  return (
                    <label key={`home-tile-${index}`} className="home-settings-card">
                      <select
                        value={tile.action}
                        onChange={(event) => update_home_tile(index, event.target.value as HomeTileAction)}
                      >
                        {HOME_TILE_OPTIONS.map((choice) => (
                          <option key={choice.action} value={choice.action}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                      <div className="home-settings-preview">
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </>
          )}

          {/* ---- Sidebar Tab ---- */}
          {'sidebar' === tab && (
            <>
              <p className="tags-label" style={{ marginBottom: 10, lineHeight: 1.4 }}>
                Turn sidebar sections on or off, and drag them into the order that fits your workflow.
              </p>
              <div className="sidebar-settings-panel">
                <label className="sidebar-settings-toggle-row">
                  <span className="sidebar-settings-label-wrap">
                    <span className="sidebar-settings-title">Search Box</span>
                    <span className="sidebar-settings-description">
                      Show the search field at the top of the sidebar.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={sidebar_layout_draft.showSearch}
                    onChange={(event) =>
                      update_sidebar_layout({
                        ...sidebar_layout_draft,
                        showSearch: event.target.checked,
                      })
                    }
                  />
                </label>
                <div className="sidebar-settings-order-header">
                  <div>
                    <h4 className="settings-section-title">Section Order</h4>
                    <p className="tags-label">Drag to reorder the visible sections below.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button sidebar-settings-reset"
                    onClick={() => update_sidebar_layout(DEFAULT_SIDEBAR_LAYOUT)}
                  >
                    Reset
                  </button>
                </div>
                <div className="sidebar-settings-order-list">
                  {sidebar_layout_draft.sectionOrder.map((section_id) => {
                    const meta = sidebar_section_meta[section_id]
                    const visible = sidebar_layout_draft.sectionVisibility[section_id]
                    return (
                      <div
                        key={section_id}
                        className={`sidebar-settings-order-item ${dragged_sidebar_section === section_id ? 'sidebar-settings-order-item-dragging' : ''}`}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', section_id)
                          set_dragged_sidebar_section(section_id)
                        }}
                        onDragOver={(event) => {
                          if (!dragged_sidebar_section) return
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(event) => {
                          if (!dragged_sidebar_section) return
                          event.preventDefault()
                          reorder_sidebar_section(section_id)
                        }}
                        onDragEnd={() => set_dragged_sidebar_section(null)}
                      >
                        <div className="sidebar-settings-order-handle" aria-hidden="true">
                          <MenuIcon size={16} />
                        </div>
                        <div className="sidebar-settings-order-body">
                          <div className="sidebar-settings-order-title-row">
                            <strong>{meta.label}</strong>
                            <label className="sidebar-settings-visibility">
                              <span>Visible</span>
                              <input
                                type="checkbox"
                                checked={visible}
                                onChange={(event) =>
                                  update_sidebar_layout({
                                    ...sidebar_layout_draft,
                                    sectionVisibility: {
                                      ...sidebar_layout_draft.sectionVisibility,
                                      [section_id]: event.target.checked,
                                    },
                                  })
                                }
                              />
                            </label>
                          </div>
                          <p>{meta.description}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* ---- Projects Tab ---- */}
          {'projects' === tab && (
            <>
              <p className="tags-label" style={{ marginBottom: 10, lineHeight: 1.4 }}>
                Projects group related notes. Rename them here, or create new ones before importing folders or
                assigning notes in the sidebar.
              </p>
              <form className="project-create-form" onSubmit={(event) => void create_project(event)}>
                <label className="project-create-field">
                  <span>New Project</span>
                  <input
                    type="text"
                    value={new_project_name}
                    onChange={(event) => set_new_project_name(event.target.value)}
                    placeholder="Work, Research, Personal"
                    spellCheck={false}
                  />
                </label>
                <button
                  className="primary-button project-create-button"
                  type="submit"
                  disabled={is_project_action_busy}
                >
                  <CirclePlusIcon size={16} />
                  <span>Create</span>
                </button>
              </form>
              {project_action_status && <p className="settings-inline-status">{project_action_status}</p>}
              <div className="project-settings-list">
                {0 === ordered_projects.length ? (
                  <div className="sidebar-section-empty project-settings-empty">
                    No projects yet. Create one above, or import a folder of markdown files to start grouping
                    notes.
                  </div>
                ) : (
                  ordered_projects.map((project) => {
                    const project_note_count = projectNoteCounts[project.id] ?? 0
                    const draft_name = project_name_drafts[project.id] ?? project.name
                    const normalized_current = project.name.trim()
                    const normalized_draft = draft_name.trim()
                    const can_save = Boolean(normalized_draft) && normalized_draft !== normalized_current

                    return (
                      <form
                        key={project.id}
                        className={`project-settings-row ${can_save ? 'project-settings-row-dirty' : ''} ${dragged_project_id === project.id ? 'project-settings-row-dragging' : ''} ${dragged_project_id ? 'project-settings-row-drop-active' : ''}`}
                        onSubmit={(event) => {
                          event.preventDefault()
                          void rename_project(project.id)
                        }}
                        onDragOver={(event) => {
                          if (!dragged_project_id) return
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(event) => {
                          if (!dragged_project_id) return
                          event.preventDefault()
                          void reorder_projects(project.id)
                        }}
                        onDragEnd={() => set_dragged_project_id(null)}
                      >
                        <button
                          type="button"
                          className={`project-settings-order-handle ${dragged_project_id === project.id ? 'project-settings-order-handle-dragging' : ''}`}
                          aria-label={`Drag ${project.name} to reorder`}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData('text/plain', project.id)
                            set_dragged_project_id(project.id)
                          }}
                          onDragEnd={() => set_dragged_project_id(null)}
                        >
                          <MenuIcon size={16} />
                        </button>
                        <label className="project-settings-name-field">
                          <span className="project-settings-label">Project Name</span>
                          <input
                            type="text"
                            value={draft_name}
                            onChange={(event) =>
                              set_project_name_drafts((current) => ({
                                ...current,
                                [project.id]: event.target.value,
                              }))
                            }
                            spellCheck={false}
                          />
                        </label>
                        <div className="project-settings-meta">
                          <span className="project-settings-count">{project_note_count} notes</span>
                        </div>
                        <div className="project-settings-actions">
                          <button
                            className="ghost-button project-settings-save"
                            type="submit"
                            disabled={!can_save || is_project_action_busy}
                          >
                            Save
                          </button>
                          <button
                            className="ghost-button project-settings-delete"
                            type="button"
                            onClick={() => void delete_project(project)}
                            disabled={is_project_action_busy}
                            title={`Delete ${project.name}`}
                          >
                            <TrashIcon size={14} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </form>
                    )
                  })
                )}
              </div>
            </>
          )}

          {/* ---- AI Tab ---- */}
          {'ai' === tab && (
            <>
              <h4 className="settings-section-title">Routing</h4>
              <label>
                AI Mode
                <select
                  value={ai_routing_mode}
                  onChange={(event) =>
                    onUpdate({ aiRoutingMode: event.target.value as Settings['aiRoutingMode'] })
                  }
                >
                  <option value="premium_only">Premium only</option>
                  <option value="cheap_only">Cheap only</option>
                  <option value="auto">Auto (routing)</option>
                  <option value="ask_each_time">Ask each time</option>
                </select>
              </label>

              <label>
                Cheap Provider
                <select
                  value={ai_cheap_provider}
                  onChange={(event) => onUpdate({ aiCheapProvider: event.target.value })}
                >
                  {CHEAP_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cheap Model
                <input
                  type="text"
                  className="search-input"
                  value={settings.aiCheapModel || ''}
                  onChange={(event) => onUpdate({ aiCheapModel: event.target.value })}
                  placeholder="e.g. deepseek-v4-flash"
                  spellCheck={false}
                />
              </label>

              <label>
                Premium Provider
                <select
                  value={ai_premium_provider}
                  onChange={(event) => onUpdate({ aiPremiumProvider: event.target.value })}
                >
                  {PREMIUM_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Premium Model
                <input
                  type="text"
                  className="search-input"
                  value={settings.aiPremiumModel || ''}
                  onChange={(event) => onUpdate({ aiPremiumModel: event.target.value })}
                  placeholder="e.g. gpt-4o"
                  spellCheck={false}
                />
              </label>

              <label>
                AI Edit Mode
                <select
                  value={settings.aiEditMode ?? 'confirm'}
                  onChange={(event) => onUpdate({ aiEditMode: event.target.value as Settings['aiEditMode'] })}
                >
                  <option value="read_only">Read Only — AI cannot edit notes</option>
                  <option value="confirm">Confirm — changes saved, revert available</option>
                  <option value="auto_apply">Auto Apply — AI edits freely (history kept)</option>
                </select>
              </label>

              <h4 className="settings-section-title">Model Catalog</h4>
              <p className="tags-label">Models available in the per-thread selector in AI chat.</p>
              <ModelCatalogEditor
                value={settings.aiModelCatalog || '{}'}
                onChange={(next) => onUpdate({ aiModelCatalog: next })}
              />

              <h4 className="settings-section-title">API Keys</h4>

              <label>
                OpenAI API Key
                <input
                  type="password"
                  className="search-input"
                  value={settings.openAiApiKey}
                  onChange={(event) => onUpdate({ openAiApiKey: event.target.value })}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <label>
                DeepSeek API Key
                <input
                  type="password"
                  className="search-input"
                  value={settings.aiDeepseekApiKey || ''}
                  onChange={(event) => onUpdate({ aiDeepseekApiKey: event.target.value })}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <label>
                Kimi / Moonshot API Key
                <input
                  type="password"
                  className="search-input"
                  value={settings.aiKimiApiKey || ''}
                  onChange={(event) => onUpdate({ aiKimiApiKey: event.target.value })}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <label>
                OpenRouter API Key
                <input
                  type="password"
                  className="search-input"
                  value={settings.aiOpenrouterApiKey || ''}
                  onChange={(event) => onUpdate({ aiOpenrouterApiKey: event.target.value })}
                  placeholder="sk-or-..."
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <label>
                Custom Provider API Key
                <input
                  type="password"
                  className="search-input"
                  value={settings.aiCustomApiKey || ''}
                  onChange={(event) => onUpdate({ aiCustomApiKey: event.target.value })}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <h4 className="settings-section-title">
                <button
                  className="ghost-button"
                  style={{ fontSize: 'inherit', fontWeight: 'inherit', margin: 0 }}
                  onClick={() => set_show_advanced((v) => !v)}
                >
                  {show_advanced ? '\u25BE' : '\u25B8'} Advanced
                </button>
              </h4>

              {show_advanced && (
                <>
                  <label>
                    Custom Provider Base URL
                    <input
                      type="text"
                      className="search-input"
                      value={settings.aiCustomBaseUrl || ''}
                      onChange={(event) => onUpdate({ aiCustomBaseUrl: event.target.value })}
                      placeholder="https://api.example.com/v1"
                      spellCheck={false}
                    />
                  </label>

                  <label className="inline-toggle">
                    <input
                      type="checkbox"
                      checked={settings.aiShowRoutingDecisions !== false}
                      onChange={(event) => onUpdate({ aiShowRoutingDecisions: event.target.checked })}
                    />
                    Show routing decisions in chat
                  </label>

                  <label className="inline-toggle">
                    <input
                      type="checkbox"
                      checked={settings.aiEnableRouteLogs !== false}
                      onChange={(event) => onUpdate({ aiEnableRouteLogs: event.target.checked })}
                    />
                    Enable route logs
                  </label>

                  <label>
                    Cheap Confidence Threshold ({settings.aiCheapConfidenceThreshold ?? 0.85})
                    <input
                      type="range"
                      min="0.5"
                      max="1.0"
                      step="0.01"
                      value={settings.aiCheapConfidenceThreshold ?? 0.85}
                      onChange={(event) =>
                        onUpdate({ aiCheapConfidenceThreshold: parseFloat(event.target.value) })
                      }
                    />
                  </label>

                  <label>
                    Premium Fallback Threshold ({settings.aiPremiumFallbackThreshold ?? 0.65})
                    <input
                      type="range"
                      min="0.3"
                      max="0.9"
                      step="0.01"
                      value={settings.aiPremiumFallbackThreshold ?? 0.65}
                      onChange={(event) =>
                        onUpdate({ aiPremiumFallbackThreshold: parseFloat(event.target.value) })
                      }
                    />
                  </label>
                </>
              )}
            </>
          )}

          {/* ---- Backups Tab ---- */}
          {'backups' === tab && (
            <>
              <label>
                Auto Backup Frequency
                <select
                  value={settings.autoBackupFrequency}
                  onChange={(event) =>
                    onUpdate({ autoBackupFrequency: event.target.value as Settings['autoBackupFrequency'] })
                  }
                >
                  <option value="off">Off</option>
                  <option value="12h">Every 12 hours</option>
                  <option value="24h">Every day</option>
                  <option value="168h">Every week</option>
                </select>
              </label>
              <p className="tags-label">Last auto backup: {format_backup_time(settings.lastAutoBackupAt)}</p>
              <div className="modal-actions backup-actions">
                <button
                  className="primary-button"
                  disabled={is_creating_backup}
                  onClick={() => {
                    set_is_creating_backup(true)
                    set_backup_status('')
                    void onCreateBackup()
                      .then((result) => set_backup_status(`Backup created: ${result.directory}`))
                      .catch((error) =>
                        set_backup_status(error instanceof Error ? error.message : 'Backup failed'),
                      )
                      .finally(() => set_is_creating_backup(false))
                  }}
                >
                  Create backup now
                </button>
                <button
                  className="ghost-button"
                  disabled={is_opening_backup_folder}
                  onClick={() => {
                    set_is_opening_backup_folder(true)
                    void onOpenBackupsFolder()
                      .catch((error) =>
                        set_backup_status(
                          error instanceof Error ? error.message : 'Could not open backups folder',
                        ),
                      )
                      .finally(() => set_is_opening_backup_folder(false))
                  }}
                >
                  Open backups folder
                </button>
              </div>
              {backup_status && <p className="tags-label">{backup_status}</p>}
              {backup_list.length > 0 && (
                <div className="backup-list">
                  <p className="backup-list-title">Recent backups</p>
                  {backup_list.map((item) => (
                    <div key={item.name} className="backup-list-item">
                      <span className="backup-list-item-name">{item.name}</span>
                      <span className="backup-list-item-meta">
                        {new Date(item.createdAt).toLocaleDateString()} · {format_backup_size(item.sizeBytes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ---- Hotkeys Tab ---- */}
          {'hotkeys' === tab && (
            <>
              <p className="tags-label" style={{ marginBottom: 10, lineHeight: 1.4 }}>
                Enter your preferred keyboard shortcuts. Use modifier keys like <code>Cmd</code>,{' '}
                <code>Ctrl</code>, <code>Shift</code>, <code>Alt</code>. Changes apply immediately.
              </p>
              {HOTKEY_FIELDS.map((field) => (
                <label key={field.id}>
                  {field.label}
                  <input
                    type="text"
                    className="search-input"
                    value={resolved_hotkeys[field.id]}
                    onChange={(event) => update_hotkey(field.id, event.target.value)}
                    spellCheck={false}
                  />
                </label>
              ))}
              <p className="tags-label" style={{ marginTop: 4, lineHeight: 1.4 }}>
                Pinned tags use <code>Cmd/Ctrl + 1-9</code> based on your pinned order.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Model Catalog Editor ----

interface ModelCatalogEditorProps {
  value: string // JSON object: {"openai":"gpt-5.5, gpt-4o", ...}
  onChange: (value: string) => void
}

const CATALOG_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', defaults: 'gpt-5.3-codex, gpt-4o, gpt-4o-mini, o4-mini' },
  { id: 'deepseek-flash', label: 'DeepSeek Flash', defaults: 'deepseek-v4-flash, deepseek-chat' },
  { id: 'deepseek-pro', label: 'DeepSeek Pro', defaults: 'deepseek-v4-pro, deepseek-reasoner' },
  { id: 'kimi', label: 'Kimi', defaults: 'kimi-k2.6, moonshot-v1-8k' },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaults: 'openai/gpt-4o, anthropic/claude-sonnet-4, google/gemini-2.5-pro',
  },
  { id: 'custom', label: 'Custom', defaults: '' },
]

function ModelCatalogEditor({ value, onChange }: ModelCatalogEditorProps) {
  const parse_value = (raw: string): Record<string, string> => {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && 'object' === typeof parsed && !Array.isArray(parsed))
        return parsed as Record<string, string>
    } catch {
      /* ignore */
    }
    return {}
  }

  const [local, setLocal] = useState<Record<string, string>>(() => {
    // Init from stored value, falling back to defaults
    const stored = parse_value(value)
    const init: Record<string, string> = {}
    for (const p of CATALOG_PROVIDERS) {
      init[p.id] = stored[p.id] || p.defaults
    }
    return init
  })

  const commit = (provider_id: string, models: string) => {
    const trimmed = models.trim()
    const next_local = {
      ...local,
      [provider_id]: trimmed || CATALOG_PROVIDERS.find((p) => p.id === provider_id)?.defaults || '',
    }
    setLocal(next_local)

    // Save only non-default values to JSON
    const to_save: Record<string, string> = {}
    for (const p of CATALOG_PROVIDERS) {
      const val = next_local[p.id].trim()
      if (val && val !== p.defaults) {
        to_save[p.id] = val
      }
    }
    onChange(JSON.stringify(to_save))
  }

  return (
    <div className="model-catalog-editor">
      <p className="tags-label" style={{ marginBottom: 8 }}>
        Add comma-separated model names per provider. Default models are pre-filled. Clear a field to reset to
        defaults.
      </p>
      {CATALOG_PROVIDERS.map((p) => (
        <label key={p.id} className="model-catalog-field">
          <span className="model-catalog-label">{p.label}</span>
          <input
            type="text"
            className="search-input"
            value={local[p.id] || ''}
            onChange={(event) => {
              const next = { ...local, [p.id]: event.target.value }
              setLocal(next)
            }}
            onBlur={(event) => commit(p.id, event.target.value)}
            onKeyDown={(event) => {
              if ('Enter' === event.key) {
                event.preventDefault()
                commit(p.id, event.currentTarget.value)
              }
            }}
            placeholder={p.defaults || 'model-name'}
            spellCheck={false}
          />
        </label>
      ))}
    </div>
  )
}
