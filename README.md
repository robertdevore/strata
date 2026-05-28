# Strata

Strata is an enterprise-ready, local-first desktop knowledge app for Markdown notes.

It is designed for teams and individuals that need fast writing workflows, reliable local data ownership, and controlled AI assistance without mandatory cloud sync.

## Version 0.5.0 Highlights

- Enterprise-facing product documentation refresh
- Configurable hotkeys with immediate in-app application
- Cleaner, more focused sidebar and tags workflows
- Improved markdown editing ergonomics (selection wrapping, task list handling)
- UI refinement pass for cleaner panel layout and reduced visual noise
- Local API and automation workflows documented for operational use

## Why Strata

- Local-first by default: notes stay on your machine
- Security-first desktop architecture: context isolation, sandboxed renderer, no renderer Node access
- Keyboard-first productivity with customizable shortcuts
- AI support with controlled edit permissions and change history
- Built-in backup workflow and disaster recovery support
- Scriptable local HTTP API for integrations and automation

## Core Capabilities

### Notes and editing

- Markdown editor with autosave and save-state feedback
- Rich-text paste to Markdown conversion
- Inline find and find/replace workflows
- Live preview with resizable split view
- Tagging with autocomplete, starring, archiving, and undo for deletes

### Navigation and organization

- Search and filter notes by text, tags, state, and metadata
- Quick Open and command palette workflows
- Pinned tags and keyboard shortcuts for rapid context switching
- Related notes and backlinks workflows

### AI workflows

- In-app AI chat panel for note analysis and drafting support
- AI provider routing and model configuration controls
- AI edit modes (`read_only`, `confirm`, `auto_apply`)
- AI edit history and revert support

### Automation and integration

- Local HTTP API for notes CRUD, search, tags, backlinks, related notes, and AI-edit operations
- CLI utilities for API interaction and note ingestion from scripts/agents
- Publish-provider abstraction for future enterprise integrations

## Installation

### Option 1: Download a release build

From GitHub Releases, download the build for your platform:

- macOS: `.dmg`
- Windows: `.exe` (NSIS)
- Linux: `.AppImage`

### Option 2: Run from source

Requirements:

- Node.js 20+
- npm

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev          # Start Strata in development mode
npm run build        # Build renderer + main + preload
npm run dist         # Create release artifacts with electron-builder
npm run test         # Run test suite once
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint project
npm run format       # Format project
npm run backup:notes # Backup local notes database files
npm run strata -- <command> # Enterprise CLI entrypoint
npm run strata:ai -- <command> # AI-focused CLI namespace
npm run strata:notes -- <command> # Notes-focused CLI namespace
npm run notes:api -- <command> [args] # Local notes HTTP API helper
npm run strata:ai:legacy -- <command> # Legacy AI helper script
```

## Build Outputs

- Application bundles: `dist/renderer`, `dist/main`, `dist/preload`
- Release artifacts: `release/`

## Data, Security, and Privacy

- Notes and settings are stored in local SQLite
- Default data path: `app.getPath('userData')/data/strata.sqlite`
- No required cloud sync
- Electron hardening in place:
	- `contextIsolation: true`
	- `sandbox: true`
	- renderer has no direct Node.js access

See also:

- `SECURITY.md`
- `docs/enterprise-readiness-checklist.md`

## Backups and Recovery

Strata uses SQLite (WAL mode). Backups include all DB sidecar files.

In-app backup controls are available in Settings:

- Create backup now
- Open backups folder
- Configure auto backup frequency

Backup locations:

- Development: `<project>/backups`
- Packaged app: `<userData>/backups`

CLI backup examples:

```bash
npm run backup:notes
./scripts/backup-notes.sh "$HOME/Dropbox/StrataBackups"
```

## Local HTTP API

Strata exposes a local HTTP API for secure machine-local automation.

- Base URL: `http://127.0.0.1:3939`
- Health: `GET /health`
- Full API guide: `API.md`

Optional auth:

- Set `STRATA_API_TOKEN`
- Send token via `X-Strata-Token` or `Authorization: Bearer ...`

Common endpoints:

- `GET /notes`
- `GET /notes/:id`
- `POST /notes`
- `PATCH /notes/:id`
- `DELETE /notes/:id`
- `GET /tags`
- `GET /search`
- `GET /notes/:id/backlinks`
- `GET /notes/:id/related`
- `GET /notes/:id/ai-edits`
- `POST /ai-edits/:id/revert`

Enterprise CLI docs:

- `CLI.md`

CLI helper examples:

```bash
npm run strata -- health
npm run strata -- notes list --query "routing" --json
npm run strata -- notes create --content "# Script note\n\nCreated from CLI" --tag automation
npm run notes:api -- health
npm run notes:api -- list
npm run notes:api -- create '{"content":"# Script note","tags":["automation"]}'
npm run notes:api -- update <NOTE_ID> '{"starred":true}'
npm run notes:api -- delete <NOTE_ID>
```

## Keyboard Shortcuts

Defaults (all configurable in Settings):

- `Cmd/Ctrl+N` New note
- `Cmd/Ctrl+O` Quick Open
- `Cmd/Ctrl+P` Toggle Preview Panel
- `Cmd/Ctrl+K` Command palette
- `Cmd/Ctrl+F` Find in note / focus search
- `Cmd/Ctrl+S` Save note
- `Cmd/Ctrl+T` Edit note tags
- `Cmd/Ctrl+Shift+T` Open all tags modal
- `Cmd/Ctrl+Shift+B` Toggle sidebar
- `Cmd/Ctrl+R` Related notes
- `Cmd/Ctrl+[` Navigate back
- `Cmd/Ctrl+]` Navigate forward
- `Esc` Close open modal/popover

## Architecture

### Main process (`app/main`)

- Creates and secures the BrowserWindow
- Registers typed IPC handlers
- Manages SQLite access and migrations

### Preload (`app/preload`)

- Exposes typed bridge as `window.strata`
- Uses narrowly scoped `ipcRenderer.invoke` calls

### Renderer (`app/renderer/src`)

- React UI + Zustand state
- Domain utilities for filtering/sorting/workflows

### Shared contracts (`app/shared`)

- Cross-process type contracts and IPC/channel models

## Enterprise Documentation Index

- `API.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `LICENSE`
- `docs/AI_PROVIDERS.md`
- `docs/AI_ROUTING.md`
- `docs/ai-edit-permissions.md`
- `docs/enterprise-readiness-checklist.md`
- `docs/publish-providers.md`
- `docs/CLI.md`

## Release Process

Recommended pre-release sequence:

```bash
npm install
npm run lint
npm run test
npm run build
npm run dist
```

Release artifacts are produced in `release/`.

## Troubleshooting

### Native module issues (`better-sqlite3`)

If Electron cannot load `better-sqlite3`, rebuild it against the project Electron version:

```bash
npm rebuild better-sqlite3 --runtime=electron --target=40.4.1 --disturl=https://electronjs.org/headers
```

### TypeScript editor-only phantom errors

If VS Code shows TypeScript errors but `npm run build` passes:

- Run `TypeScript: Restart TS Server`
- Or run `Developer: Reload Window`
