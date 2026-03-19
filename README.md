# Strata

Strata is a local-first desktop markdown notes app built with Electron, React, and TypeScript.

It is designed for focused writing with fast note capture, keyboard-first workflows, and zero required cloud services.

## Why Strata

- Local-first by default (your notes stay on your machine)
- Minimal UI with dark/light/system theme support
- Fast filtering and search across notes
- Markdown editing with autosave and save-state feedback
- Tagging, starring, archiving, and keyboard shortcuts for daily flow
- Built-in AI chat panel for note analysis and chat-history search (read-only tools in v1)

## Features

- Markdown notes with autosave (`Saving…`, `Saved`, `Save failed`)
- Sidebar filters: `All`, `Starred`, `Archived`, `Untagged`
- Full-text search and tag filtering
- Star / archive / delete actions + right-click context menu
- Tag editor with existing-tag suggestions
- Settings for theme, default view, delete confirmation, and sort mode
- Secure Electron defaults (`contextIsolation`, `sandbox`, no renderer Node access)

## 0.3.0 release notes

- Rich-text paste now converts clipboard HTML into Markdown (headings, lists, emphasis, links, images, etc.)
- Sidebar header now shows inline app version (`STRATA v0.3.0`)
- New note UX now places the cursor after `# Untitled` with a blank line ready for writing
- Desktop menu behavior improved with native window/application shortcuts (including `Cmd+W` on macOS)
- Note switching regression fixed (selecting a note reliably opens that note)

## Release checklist

Use this sequence before publishing a GitHub release:

```bash
npm install
npm run lint
npm run test
npm run build
npm run dist
```

Artifacts are produced in `release/`.

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
npm run dev        # Start Strata in development mode
npm run build      # Build renderer + main + preload
npm run dist       # Create release artifacts with electron-builder
npm run test       # Run test suite once
npm run test:watch # Run tests in watch mode
npm run lint       # Lint project
npm run format     # Format project
npm run backup:notes # Backup local notes database files
npm run notes:api -- <command> [args] # CLI helper for local notes HTTP API
```

## Build outputs

- Application bundles: `dist/renderer`, `dist/main`, `dist/preload`
- Release artifacts: `release/`

## Data & privacy

- Notes and settings are stored in local SQLite
- Default path: `app.getPath('userData')/data/strata.sqlite`
- No cloud sync is required

## AI chat panel (GPT-4o)

Strata includes an in-app AI panel (chatbot icon in the editor footer) that can:

- Analyze your local notes
- Search notes by content/tags
- Search previous AI chats
- Retrieve chat threads for context

The assistant can also create new notes and edit existing notes when requested.

The assistant does not delete notes.

### Secure key setup

Option 1 (recommended): set your API key as an environment variable before launching Strata:

```bash
export STRATA_OPENAI_API_KEY="your-openai-key"
npm run dev
```

Option 2: open `Settings` in Strata and paste your key into `OpenAI API Key`.

The key is stored in local Strata settings (`strata.sqlite`) so it persists across launches.

Priority order for key resolution:

1. `STRATA_OPENAI_API_KEY` environment variable
2. Stored `OpenAI API Key` from Settings

## Backups

Strata stores notes in SQLite and uses WAL mode, so backups should include all database sidecar files.

You can now manage backups directly in `Settings`:

- `Create backup now` creates an immediate snapshot.
- `Open backups folder` opens the local backup directory.
- `Auto Backup Frequency` controls periodic automatic backups (default: every day).

Backup location:

- Development: `<project>/backups`
- Packaged app: `<userData>/backups`

Run a timestamped backup (default destination: `~/StrataBackups`):

```bash
npm run backup:notes
```

Backup to a custom location (for offsite sync folders, external drive paths, etc.):

```bash
./scripts/backup-notes.sh "$HOME/Dropbox/StrataBackups"
```

The backup includes:

- `strata.sqlite`
- `strata.sqlite-wal` (if present)
- `strata.sqlite-shm` (if present)

Default data source path on macOS:

- `~/Library/Application Support/Strata/data`

If your `userData` location is custom, override source path:

```bash
STRATA_USER_DATA_DIR="/custom/path/to/data" npm run backup:notes
```

## Keyboard shortcuts

- `Cmd/Ctrl+N` — New note
- `Cmd/Ctrl+F` — Focus search
- `Cmd/Ctrl+Shift+F` — Toggle filters panel
- `Cmd/Ctrl+S` — Save note
- `Cmd/Ctrl+Backspace` — Delete selected note
- `Cmd/Ctrl+Shift+A` — Toggle archive
- `Cmd/Ctrl+Shift+S` — Toggle star
- `Cmd+W` (macOS) — Close window
- `Esc` — Close open modal/popover

## Architecture

### Main process (`app/main`)

- Creates and secures the BrowserWindow
- Registers typed IPC handlers
- Manages SQLite access and migrations

### Preload (`app/preload`)

- Exposes typed API bridge as `window.strata`
- Uses `ipcRenderer.invoke` for narrow, explicit IPC

### Renderer (`app/renderer/src`)

- React UI + Zustand app state
- Services layer for notes/settings actions
- Domain utilities for note filtering/sorting

### Shared (`app/shared`)

- Shared type contracts between main/preload/renderer

## API surface (preload bridge)

`window.strata` includes:

- `notes.list(filters)`
- `notes.get(id)`
- `notes.create()`
- `notes.update(id, patch)`
- `notes.delete(id)`
- `notes.archive(id, archived)`
- `notes.star(id, starred)`
- `tags.list()`
- `settings.get()`
- `settings.set(patch)`

## Local notes HTTP API

Strata now exposes a local HTTP API for notes CRUD so other apps/scripts on your computer can create, read, update, and delete notes.

For a full, agent-focused API playbook with end-to-end examples, see `API.md`.

- Base URL: `http://127.0.0.1:3939`
- Health check: `GET /health`

Environment overrides:

- `STRATA_API_HOST` (default: `127.0.0.1`)
- `STRATA_API_PORT` (default: `3939`)
- `STRATA_API_TOKEN` (optional; when set, all requests must include matching token)

Auth headers (when `STRATA_API_TOKEN` is set):

- `X-Strata-Token: <your-token>`
- or `Authorization: Bearer <your-token>`

Endpoints:

- `GET /notes`
	- Query params: `query`, `starred=true|false`, `archived=true|false`, `tag`, `includeDeleted=true|false`
- `GET /notes/:id`
- `POST /notes` (optional JSON body: `content`, `starred`, `archived`, `tags`)
- `PUT /notes/:id` or `PATCH /notes/:id` (JSON body: any of `content`, `starred`, `archived`, `tags`)
- `DELETE /notes/:id`

Example calls:

```bash
curl http://127.0.0.1:3939/notes

curl http://127.0.0.1:3939/notes \
	-H "X-Strata-Token: your-secret-token"

curl -X POST http://127.0.0.1:3939/notes \
	-H "Content-Type: application/json" \
	-H "X-Strata-Token: your-secret-token" \
	-d '{"content":"# API note\n\nCreated from curl","tags":["api","automation"]}'

curl -X PATCH http://127.0.0.1:3939/notes/<NOTE_ID> \
	-H "Content-Type: application/json" \
	-H "Authorization: Bearer your-secret-token" \
	-d '{"starred":true}'

curl -X DELETE http://127.0.0.1:3939/notes/<NOTE_ID> \
	-H "X-Strata-Token: your-secret-token"
```

CLI helper:

```bash
npm run notes:api -- health
npm run notes:api -- list
npm run notes:api -- create '{"content":"# Script note","tags":["automation"]}'
npm run notes:api -- update <NOTE_ID> '{"starred":true}'
npm run notes:api -- delete <NOTE_ID>
```

Set these when needed:

- `STRATA_API_BASE_URL` (default: `http://127.0.0.1:3939`)
- `STRATA_API_TOKEN` (for protected API)

## Troubleshooting

### Native module issues (`better-sqlite3`)

If Electron cannot load `better-sqlite3`, rebuild it against your Electron version:

```bash
npm rebuild better-sqlite3 --runtime=electron --target=40.4.1 --disturl=https://electronjs.org/headers
```

### VS Code TypeScript phantom errors

If editor-only errors appear but `npm run build` passes:

- Run `TypeScript: Restart TS Server`
- Or run `Developer: Reload Window`

## Roadmap hooks

Strata already includes a publish-provider abstraction for future integrations:

- `integrations/publish/PublishProvider.ts`
- `integrations/publish/providers/DummyProvider.ts`

This keeps external publishing features decoupled from core note storage and UI flows.
