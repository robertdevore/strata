import type { Note, Project } from '@shared/types'
import { get_home_tile_option, type HomeTileAction, type HomeTileConfig } from '@shared/homeTiles'
import { deriveNoteTitle, formatLastEdited, formatRelativeTime } from '@renderer/src/domain/noteUtils'
import {
  CirclePlusIcon,
  CirclesRelationIcon,
  FileSearchIcon,
  ListDetailsIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
} from './icons'

interface HomePaneProps {
  notes: Note[]
  projects: Project[]
  homeScreenMode: 'home' | 'projects'
  homeTiles: HomeTileConfig[]
  onHomeScreenModeChange: (mode: 'home' | 'projects') => void
  onHomeTileAction: (action: HomeTileAction) => void
  onCreateProjectNote: (projectId: string) => Promise<void>
  onOpenProjectNote: (projectId: string) => Promise<void>
  onOpenNote: (noteId: string, newTab?: boolean) => Promise<void>
}

const renderHomeTileIcon = (action: HomeTileAction) => {
  if ('new_note' === action) return <CirclePlusIcon />
  if ('quick_open' === action) return <SearchIcon />
  if ('focus_search' === action) return <FileSearchIcon />
  if ('open_tags' === action) return <TagIcon />
  if ('open_projects' === action) return <ListDetailsIcon />
  if ('toggle_filters' === action) return <ListDetailsIcon />
  if ('new_project' === action) return <CirclesRelationIcon />
  if ('toggle_sidebar' === action) return <MenuIcon />
  return <SettingsIcon />
}

export function HomePane(props: HomePaneProps) {
  const {
    notes,
    projects,
    homeScreenMode,
    homeTiles,
    onHomeScreenModeChange,
    onHomeTileAction,
    onCreateProjectNote,
    onOpenProjectNote,
    onOpenNote,
  } = props

  const resolvedHomeTiles = homeTiles.slice(0, 3)
  const projectSummaries = projects.map((project) => {
    const projectNotes = notes.filter((note) => note.projectId === project.id)
    const sortedNotes = [...projectNotes].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    return {
      project,
      noteCount: projectNotes.length,
      latestUpdatedAt: sortedNotes[0]?.updatedAt ?? project.updatedAt,
      recentNotes: sortedNotes.slice(0, 3),
    }
  })

  return (
    <section className="editor empty-editor home-screen">
      <div
        className={`home-screen-card ${'projects' === homeScreenMode ? 'home-screen-card-projects' : ''}`}
      >
        <div className="home-screen-mode-row">
          <div>
            <p className="home-screen-kicker">Welcome to Strata</p>
            <h2>{'projects' === homeScreenMode ? 'Project Grid' : 'Start with the next useful thing.'}</h2>
            <p className="home-screen-copy">
              {'projects' === homeScreenMode
                ? 'See every project in one place with counts, recent notes, and last-edited timing.'
                : 'Create a note, find something you already saved, or tune the workspace before you dive in.'}
            </p>
          </div>
          <div className="home-screen-mode-switcher" role="tablist" aria-label="Home screen view">
            <button
              type="button"
              className={`home-screen-mode-button ${'home' === homeScreenMode ? 'home-screen-mode-button-active' : ''}`}
              onClick={() => onHomeScreenModeChange('home')}
            >
              Home
            </button>
            <button
              type="button"
              className={`home-screen-mode-button ${'projects' === homeScreenMode ? 'home-screen-mode-button-active' : ''}`}
              onClick={() => onHomeScreenModeChange('projects')}
            >
              Projects
            </button>
          </div>
        </div>
        {'home' === homeScreenMode ? (
          <div className="home-tile-grid">
            {resolvedHomeTiles.map((tile) => {
              const option = get_home_tile_option(tile.action)
              return (
                <button
                  key={tile.action}
                  type="button"
                  className="home-tile"
                  onClick={() => onHomeTileAction(tile.action)}
                >
                  <span className="home-tile-icon">{renderHomeTileIcon(tile.action)}</span>
                  <span className="home-tile-body">
                    <span className="home-tile-title">{option.label}</span>
                    <span className="home-tile-description">{option.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="project-grid-panel">
            <div className="project-grid-toolbar">
              <p className="home-screen-copy project-grid-copy">
                Use these cards to jump into a project, inspect recent activity, or spin up a new note
                inside the right bucket.
              </p>
              <button
                type="button"
                className="primary-button project-grid-create-button"
                onClick={() => onHomeTileAction('new_project')}
              >
                <CirclePlusIcon size={16} />
                <span>New Project</span>
              </button>
            </div>
            {0 === projectSummaries.length ? (
              <div className="sidebar-section-empty project-grid-empty">
                No projects yet. Create one to group related notes, or import a folder of markdown files to
                build one automatically.
              </div>
            ) : (
              <div className="project-grid">
                {projectSummaries.map(({ project, noteCount, latestUpdatedAt, recentNotes }) => (
                  <article key={project.id} className="project-grid-card">
                    <div className="project-grid-card-head">
                      <div className="project-grid-card-title-row">
                        <h3 className="project-grid-card-title">{project.name}</h3>
                        <span className="project-grid-card-count">{noteCount}</span>
                      </div>
                      <div className="project-grid-card-meta">
                        <span>
                          {0 === noteCount
                            ? 'No notes yet'
                            : `${noteCount} note${1 === noteCount ? '' : 's'}`}
                        </span>
                        <span title={formatLastEdited(latestUpdatedAt)}>
                          Updated {formatRelativeTime(latestUpdatedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="project-grid-card-notes">
                      {0 === recentNotes.length ? (
                        <span className="project-grid-card-empty-note">
                          Create the first note to start the project.
                        </span>
                      ) : (
                        recentNotes.map((projectNote) => (
                          <button
                            key={projectNote.id}
                            type="button"
                            className="project-grid-note-pill"
                            onClick={() => void onOpenNote(projectNote.id)}
                          >
                            {deriveNoteTitle(projectNote.content)}
                          </button>
                        ))
                      )}
                    </div>
                    <div className="project-grid-card-actions">
                      <button
                        type="button"
                        className="ghost-button project-grid-card-button"
                        onClick={() => void onOpenProjectNote(project.id)}
                        disabled={0 === noteCount}
                      >
                        Open Latest
                      </button>
                      <button
                        type="button"
                        className="primary-button project-grid-card-button"
                        onClick={() => void onCreateProjectNote(project.id)}
                      >
                        <CirclePlusIcon size={16} />
                        <span>New Note</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
