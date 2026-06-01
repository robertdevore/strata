# Strata

[![Release](https://img.shields.io/github/v/release/robertdevore/strata?label=release&color=2f6feb)](https://github.com/robertdevore/strata/releases)
[![License](https://img.shields.io/github/license/robertdevore/strata?color=0e8a16)](LICENSE)
[![Electron](https://img.shields.io/badge/electron-40.8.5-47848F?logo=electron)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![SQLite](https://img.shields.io/badge/sqlite-local--first-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)

Local-first Markdown notes app with optional AI, keyboard-first workflows, and a scriptable local API.

## Why Strata

- Local by default. Your notes stay on your machine.
- Fast writing and navigation with command palette and hotkeys.
- Optional AI assistance with explicit edit controls and revert history.
- Local HTTP API + CLI for automation and agent workflows.
- Security-hardened desktop architecture (sandbox + context isolation).

## What is new in 0.6.0

- Multi-pinned split panes (pin multiple notes at once).
- Grid layout mode for pinned notes (2/3/4-column workflows).
- Memory/performance improvements across renderer and main process.
- Cleaner split-pane behavior and tab-level pin controls.

## Install

### Download a release

Get platform builds from [GitHub Releases](https://github.com/robertdevore/strata/releases):

- macOS: DMG
- Windows: NSIS EXE
- Linux: AppImage

### Run from source

Requirements:

- Node.js 20+
- npm

```bash
npm install
npm run dev
```

## Quick start

```bash
# typecheck + production build
npm run build

# create release artifacts
npm run dist

# run tests
npm run test
```

## Core features

### Notes and editing

- Markdown editor with autosave + save state.
- Rich-text paste to Markdown.
- Split preview and editable note panes.
- Tags, starring, archiving, undo delete.

### Navigation and organization

- Search and filtering by query, tags, and note state.
- Quick Open and command palette.
- Related notes + backlinks.
- Pinned tags and customizable shortcuts.

### AI workflows

- In-app chat panel for drafting and analysis.
- Provider/model routing controls.
- Edit safety modes: read-only, confirm, auto-apply.
- AI edit history and revert endpoint.

## CLI and API

- CLI docs: [CLI.md](CLI.md)
- HTTP API docs: [API.md](API.md)

Base URL (local API):

- http://127.0.0.1:3939

Examples:

```bash
npm run strata -- health
npm run strata -- notes list --json
npm run strata -- notes create --content "# Note\n\nCreated from CLI"

curl http://127.0.0.1:3939/health
```

## Security and data model

- Notes/settings stored in local SQLite.
- WAL mode + scheduled backups.
- No mandatory cloud sync.
- Electron hardening:
  - contextIsolation enabled
  - sandbox enabled
  - no renderer Node.js access

See [SECURITY.md](SECURITY.md) and [docs/enterprise-readiness-checklist.md](docs/enterprise-readiness-checklist.md).

## Project structure

```text
app/
  main/      Electron main process, IPC handlers, DB, API server
  preload/   Secure bridge exposed as window.strata
  renderer/  React UI + Zustand state
  shared/    Cross-process types and contracts
docs/        Deep-dive docs (AI, CLI, publishing, enterprise)
scripts/     Dev and automation helpers
release/     Built installers/artifacts
```

## Scripts

```bash
npm run dev
npm run build
npm run dist
npm run test
npm run lint
npm run format
npm run backup:notes
```

## Documentation index

- [API.md](API.md)
- [CLI.md](CLI.md)
- [SECURITY.md](SECURITY.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md)
- [docs/AI_ROUTING.md](docs/AI_ROUTING.md)
- [docs/ai-edit-permissions.md](docs/ai-edit-permissions.md)
- [docs/enterprise-readiness-checklist.md](docs/enterprise-readiness-checklist.md)
- [docs/publish-providers.md](docs/publish-providers.md)

## Troubleshooting

If Electron cannot load better-sqlite3:

```bash
npm rebuild better-sqlite3 --runtime=electron --target=40.8.5 --disturl=https://electronjs.org/headers
```

If TypeScript diagnostics in editor are stale while build passes, run:

- TypeScript: Restart TS Server
- Developer: Reload Window
