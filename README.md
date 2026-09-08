# Strata

[![Release](https://img.shields.io/github/v/release/robertdevore/strata?label=release&color=2f6feb)](https://github.com/robertdevore/strata/releases) [![License](https://img.shields.io/github/license/robertdevore/strata?color=0e8a16)](LICENSE)

Strata is a local-first Markdown notes app with keyboard-first navigation, an optional multi-provider AI assistant, and local CLI/HTTP interfaces for automation.

## Install

Download the DMG, NSIS installer, or AppImage from [GitHub Releases](https://github.com/robertdevore/strata/releases).

To run from source (Node.js 22+):

```bash
npm install
npm run dev
```

## Use

- Create and edit Markdown notes with autosave, split preview, tags, stars, archive, and undo delete.
- Organize notes into reorderable projects or import a folder of Markdown files. Desktop folder drops accept up to 50 Markdown files, 790 KB per file and 8 MiB total, and import each folder atomically. Split larger folders before dropping them.
- Find material through search, Quick Open, related notes, and backlinks.
- Use AI in read-only, confirm-before-edit, or auto-apply mode with edit history and revert support.
- Automate local workflows through the CLI or API at `http://127.0.0.1:3939`.

```bash
npm run strata -- health
npm run strata -- notes list --json
npm run strata -- notes create --content "# Note\n\nCreated from CLI"
npm run strata -- projects import ./my-notes-folder
curl http://127.0.0.1:3939/health
```

See [CLI.md](CLI.md) and [API.md](API.md) for complete contracts.

## What changed in 0.8.0

- AI provider tool loops now preserve assistant tool-call context and use provider-compliant tool-result messages.
- Exact tag filters have regression coverage.
- Unused 3D prototype dependencies were removed from the production app, reducing install and package size; the prototype remains isolated on its feature branch.
- Release dependencies were refreshed and audited with no known npm vulnerabilities.

## Develop and release

```bash
npm run test
npm run lint
npm run build
npm run dist
```

The application uses Electron, React, TypeScript, CodeMirror, and SQLite. Important directories:

- `app/main`: database, IPC, local API, and Electron lifecycle
- `app/preload`: sandboxed renderer bridge
- `app/renderer`: React UI and state
- `app/shared`: cross-process contracts
- `docs`: AI, API, publishing, and operations guides

Notes and settings remain in local SQLite unless you explicitly configure an external AI provider or integration. WAL mode, scheduled backups, database recovery, Electron sandboxing, context isolation, and AI edit controls protect local work.

See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [docs/enterprise-readiness-checklist.md](docs/enterprise-readiness-checklist.md).

## Troubleshooting

If Electron cannot load `better-sqlite3`, rebuild it for the Electron version declared in `package.json`:

```bash
npx electron-rebuild -f -w better-sqlite3
```

Routing diagnostics are off by default for new libraries. When enabled, Strata stores routing metadata without message excerpts or provider error text. Settings provide 7-day, 30-day (default), or unlimited retention and a clear action. Upgrading removes historical excerpts from the active library; older backup files are not rewritten.
