# Strata repository guide

Strata 0.9.2 is a local-first Electron/React Markdown knowledge application. SQLite is the knowledge source of truth; AI is optional. The full hardening upgrade is tracked in `docs/hardening/STATUS.md` and `docs/hardening/requirements.md`. Intermediate commits and historical audits are not release-readiness verdicts.

## Architecture

- `app/main/db`: SQLite migrations, deterministic indexes, transactions and note revisions.
- `app/main/services`: shared validation, mutation operations, idempotency, batch/dry-run and proposals.
- `app/main/api`: authenticated loopback HTTP transport.
- `app/main/ipc`, `app/preload`: typed desktop boundary; no renderer shell execution.
- `app/main/ai`: optional providers, routing, bounded tool loop and tools using shared services.
- `app/cli`: HTTP client only; the separate standalone server owns its database connection.
- `app/renderer`: React, Zustand and CodeMirror; preserve dirty drafts and their original revisions.

## Invariants

- Never add wildcard CORS, unauthenticated API defaults, unsafe binding, arbitrary shell IPC, renderer Node access or unvalidated external navigation.
- Register desktop IPC through `handleTrustedIpc`; never bypass its sender/frame/document validation. Permissions default to deny outside the application main frame.
- Provider keys belong in OS-encrypted storage, never ordinary settings, backups, diagnostics or logs. Renderer settings expose only presence markers.
- Emit committed `ChangedDomains` through `data:changed`; keep projects, tags, graph panels and history current without reloading unrelated data. Do not emit mutation notifications for dry-runs, rolled-back batches or idempotent replays.
- Logical mutations must be transactional with indexes and history. Pass the revision actually read; never fetch a fresh revision merely to bypass a conflict.
- AI read-only blocks every mutation domain. Confirm creates a reviewable proposal; explicit human approval rechecks its original revision. Models cannot approve proposals.
- List/search return bounded summaries. Fetch full bodies explicitly. Duplicate titles must remain ambiguous.
- Add versioned migrations; do not change released migrations. Test legacy fixtures and foreign keys.
- Agent memory uses supported CLI/API, never raw SQLite. Direct SQLite in isolated DB tests/benchmarks is appropriate.
- Preserve local `work/` knowledge exports and keep them out of commits.

## Verification

Run `npm run verify` for source formatting, lint, all offline tests (including TSX UI tests), TypeScript checking and production build. Use `npm run format:source` to normalize source/config formatting. Run `npm run benchmark` separately against synthetic libraries. GitHub Actions runs verification and dependency audit on Linux and macOS; run `npm run package:verify`, `npm run package:electron:verify`, and `npm run desktop:verify` separately for installed CLI, native Electron packaging, and isolated desktop interactions. Native directory/worker CI covers Linux, macOS and Windows. Signing, notarization and actual installer acceptance follow docs/RELEASING.md. Final evidence is in docs/hardening/FINAL-REPORT.md.

Use synthetic temporary libraries. Preserve immutable baselines and disclose workload changes. Never use the live user database as a fixture. Normal tests must not depend on live AI providers. Validate desktop behavior and packaged native SQLite separately.

At completion, commit meaningful changes and push a clean working tree. Consolidate durable memory through Strata with provenance. SignalBox is only for unresolved future-actionable findings.
