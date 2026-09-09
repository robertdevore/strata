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
npm run strata -- --confirm projects import ./my-notes-folder
npm run strata -- capabilities --json
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

See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), the [hardening report](docs/hardening/FINAL-REPORT.md), and [release gates](docs/RELEASING.md).

## Troubleshooting

If Electron cannot load `better-sqlite3`, rebuild it for the Electron version declared in `package.json`:

```bash
npx electron-rebuild -f -w better-sqlite3
```

Routing diagnostics are off by default for new libraries. When enabled, Strata stores routing metadata without message excerpts or provider error text. Settings provide 7-day, 30-day (default), or unlimited retention and a clear action. Upgrading removes historical excerpts from the active library; older backup files are not rewritten.

Backup settings show universal note-history snapshot storage and offer manual cleanup. Preview a retention count (at least 20 revisions per note), then explicitly apply it. Cleanup rejects a changed preview, preserves current notes and the newest recovery points for every note, and leaves existing backups alone. Automatic history deletion is disabled; review storage periodically. Freed SQLite pages can be reused without reducing the database file size.

Run `npm run verify` before submitting changes. It checks source formatting, lint, all offline tests, TypeScript and the production build. `npm run format:source` applies the expected formatting; `npm run benchmark` runs the heavier synthetic database workloads separately. GitHub Actions runs verification on Node 22 for Linux and macOS. Live-provider calls and signed desktop packaging are separate checks.

Chat model choices retain their provider identity. “Auto” uses the configured router; an explicit choice uses its catalog provider. If an older chat's bare model name is ambiguous or no longer in the catalog, select its provider/model again or add the model to Settings. Strata does not guess a provider from the model's name.

`npm run package:electron:verify` builds an unsigned temporary Electron directory and checks its bundled assets and native SQLite/FTS runtime without opening the live library. It requires Electron build dependencies/download access. It does not sign, notarize, publish, or prove installer and renderer behavior. The macOS CI job runs this separately from normal source verification.

For custom OpenAI-compatible endpoints, Advanced AI settings let you disable unsupported tool calls, system messages, or temperature parameters. Text-only endpoints cannot retrieve or edit notes through tools. When system roles are unavailable, instructions are included as user text; mutation permissions remain enforced by Strata.

Desktop Backup settings can retain all automatic backups (default) or the newest 7, 30, or 90. Retention runs only after a verified automatic backup and preserves manual, pre-restore and unrecognized older backups. New backups include schema/integrity metadata; failed attempts are removed rather than offered as recovery points.

Restoring a backup requires all editor drafts to save successfully. Strata pauses new desktop work, drains active requests and backups, and saves a current recovery point before replacement. Close other Strata processes using the same library before restoring. SQLite coordination files in the data directory protect supported Strata owners during restore and corruption recovery; do not remove those files while Strata is open. Direct SQLite tools do not participate in this protocol and must also be closed. Restore imports accept `.sqlite` or `.db` files and validate/migrate an isolated snapshot before changing the library.

`npm run desktop:verify` builds and launches real Electron with a disposable library and authenticated ephemeral API port. It verifies editor autosave, history restoration, reopening saved content after reload, and the sandboxed preload boundary. It requires a graphical desktop and the installed Electron native dependencies; it does not access the normal user library or call AI providers. The macOS CI job runs it after native package verification.

Runtime logs use fixed messages and allowlisted error codes. Startup checkpoints are quiet by default; set `STRATA_DEBUG=1` to enable them. Debug mode does not include raw exceptions, note/chat text, keys, request URLs, or library paths. CLI `--verbose` reports request methods and attempts without search queries or credentials. Command results and explicitly requested exports still contain the data you requested.

In split view, each note has its own save status and conflict recovery controls. A conflict in one pane stays visible while other notes save; use that pane’s recovery controls to preserve or discard its draft. In the Markdown editor, Ctrl/Cmd-click opens a wiki link; ordinary clicks place the caret. Preview links open with a normal click.

The hardening upgrade adds mandatory local API authentication, OS-encrypted provider secrets, universal revisions, conflict-safe writes, indexed retrieval and bounded agent context. The [60-step evidence ledger](docs/hardening/requirements.md) records coverage and explicit limits. Current native-package CI covers Linux, macOS and Windows; signed installer acceptance remains a release gate.

Use `npm run benchmark:controlled`, `npm run benchmark:renderer`, `npm run benchmark:check -- ARTIFACT.json` and `npm run eval:routing` for the documented isolated performance/evaluation workflows. See [performance budgets](docs/hardening/performance-budgets.md). Use `npm run release -- --help` and the release guide for native signing configuration.

Wiki-link completion searches the full library. Missing targets can be created explicitly; duplicate titles require selection. Title links retain their literal Markdown when a target is renamed and may become missing; UUID links remain stable. No automatic global Markdown rewrite occurs.
