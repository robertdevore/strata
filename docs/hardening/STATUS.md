# Hardening work record

Source request: attached “Strata Full Hardening + Performance + Agentic UX Upgrade”, 2026-09-08. Starting commit: e2ca89b; version 0.8.0. This record is in progress, not a release-readiness claim.

Baseline: 77 tests / 16 files passed. Production TypeScript/Vite build passed. Existing untracked `work/` contains local knowledge exports; preserve locally and exclude from commits. Historical `.loop-engineering` success describes the prior retrieval contract only.

## Work remaining

- [ ] Complete repository inspection and verify all 60 requested areas
- [ ] HTTP boundaries, credential discovery, bounded structured protocol
- [ ] Renderer shell removal, publishing, navigation and IPC boundaries
- [ ] OS-backed provider secrets and migration/backup sanitization
- [ ] Transactional domain operations, universal revisions and conflicts
- [ ] Indexed titles, incremental links, FTS, summaries and pagination
- [ ] SQL tags, joined backlinks, bounded related candidates
- [ ] AI confirmation, context budget, shared fallback loop and schemas
- [ ] Provider/transcription constraints and capability compatibility
- [ ] Invalidation, autosave conflicts and history UI
- [ ] Idempotency, batch, capability discovery and installed CLI
- [ ] Memory conventions/deduplication, retention and backup integrity
- [ ] Benchmarks, regression tests, desktop/package checks and CI
- [ ] Current docs, final assessment, commits/push and memory consolidation

## Decisions

- Refuse all non-loopback HTTP bindings. Remote clients may use an intentionally configured authenticated tunnel.
- API credentials are generated locally in an owner-only file; explicit credentials and credential file paths remain supported. Never auto-send the local credential to non-loopback hosts.
- Remove the unused shell bridge entirely. Publishing uses the existing typed HTML export operation, restricted to a folder chosen in the native dialog.
- Preserve pre-existing local `work/` exports without committing user knowledge.

## Verified checkpoint, 2026-09-08

- Commits 540a35d, 1c8468b, 6261736 implement the first security/domain/AI increments. These are not completion claims.
- Current full suite: 102 tests / 21 files passed; lint passed; production build passed. Three further focused autosave/pagination tests pass after renderer changes.
- Universal revision snapshots, explicit revision checks, bounded summary pages, FTS prefix matching with substring fallback, indexed unambiguous titles, incremental link resolution, SQL tag aggregation, joined backlinks, bounded related candidates, transactional batch/dry-run, idempotency receipts, and capability metadata exist.
- AI mutations use shared service operations; confirm stores proposals with before/after snapshots. Native UI approval/rejection rechecks revisions. Read-only now blocks project mutations too. Both provider routes use the same loop; history and loop sizes are bounded.
- Provider requests have bounded reads, deadlines, no redirects, and sanitized error codes. Audio input validation first bounds size; the initial grouped base64 regex caused a reproducible stack overflow on a large input and was replaced with a linear character check after the size gate.
- Renderer work in progress: server result pages, draft retention, serialized autosaves, stale-save conflict state and copy/reload recovery. No final desktop validation yet.

## Explicit remaining gaps for the next completion audit

- FTS relevance currently prioritizes title and recency; add/test BM25 and measure performance. Cursor implementation uses validated offsets; document concurrent-pagination semantics.
- Complete migration legacy FK compatibility, project references, indexes/history retention strategy and universal history UI.
- Ensure every IPC/CLI/AI operation shares service validation, safe preconditions, notifications and history (including delete/restore/star/archive/import/project/reorder).
- Confirm proposals need user-friendly text diffs and per-thread scoping; verify restart, approval failure and all write types. Universal history replaces new AI edit rows but legacy UI still requires integration.
- Strengthen provider conformance, explicit model capabilities/selection, cancellation UI, fallback execution-state tests, route-log privacy/retention.
- Finish CLI installation/build, summary display/projections, pagination, capabilities, batch, history, request IDs, capture deduplication and memory conventions.
- Complete benchmark suite and token payload measurements, renderer checks, backup/recovery/restore tests, standalone secret migration, packaging/CI/dependency audit, docs and 60-step evidence map.
- Preserve original requested scope. No goal completion until all applicable requirements are proven. Final commit/push and Strata consolidation remain required.

### Measured follow-up

`after-initial.json` uses the same synthetic fixture size and five-sample medians but the new bounded list/related interfaces. At 50k notes, list100 was 2.08ms, search10 2.11ms, update+links 1.91ms, and related 2.19ms. SQL JSON1 tag aggregation remained slow (682ms); migration 11 now materializes an active note/tag index maintained by JSON1 triggers. Rebenchmark and validate before making final performance claims. Baseline lists were unbounded; report that contract change explicitly.

### Renderer/CLI checkpoint

- Server-backed renderer pages include explicit filters and sorting, preserve open/dirty notes outside a page, and offer load-more. Draft conflicts offer save-as-new-note/reload or deliberate discard/reload. Three focused store tests verify stale saves, overlapping save serialization and remote search over full bodies.
- CLI executable `scripts/strata.mjs` uses the supported tsx runtime and package `bin` contract. Capabilities, atomic batch/dry-run/request IDs, history list/restore and `notes update --if-revision` are wired. An integration test runs the executable from a temporary directory against a real temporary API and verifies dry-run rollback, idempotent retries, stale updates, compact context and explicit full fetch.
- `npm audit` after compatible dependency updates and the xmldom 0.8.15 security override reports zero vulnerabilities. Native packaging still requires validation.
- Added resumable secret sanitization: a blocked WAL checkpoint fails explicitly and persists a cleanup marker; a subsequent attempt completes cleanup without losing the encrypted credential. Concurrent-reader regression test covers recovery.
- Remaining CLI work includes complete pagination/projection flags, metadata/deduplication, packaged standalone verification and bounded input handling. Remaining renderer work includes history UI, all mutation preconditions, deep navigation/Quick Open search and desktop interaction tests.

### Additional checkpoint findings

- Added BM25 ranking (title/content/tag weights 8/1/4) after exact/prefix title priority. Fixed substring fallback pagination by selecting its mode consistently across pages; regression test added.
- Renderer revision history now lists metadata and loads one selected snapshot, with revision-safe restore and dirty-draft blocking. History storage statistics and explicit pruning primitives exist but still need full UI/CLI retention integration.
- CLI list exposes cursor/full/fields/ids-only/page-count output; search uses server tag/project filters and returns nextCursor. CLI file/stdin inputs are bounded at 1MB.
- Legacy `backup-notes.sh` copied SQLite/WAL/SHM directly, risking inconsistent snapshots and provider-secret export. Replaced its implementation with an administrative Python SQLite backup utility that sanitizes credentials, vacuums, checks integrity and writes schema/timestamp metadata. A synthetic credential-preservation fixture passed. Integrate this fixture into consolidated verification.
- Startup now refuses future database schema versions instead of attempting unsupported writes.

### Desktop revision enforcement and approval notification checkpoint

Desktop delete, restore, archive and star now require the revision read by the renderer and use KnowledgeService. Undo remembers the deletion revision, so another restore/delete cycle cannot be silently overwritten. CLI update contracts require a revision; metadata commands explicitly read before writing and the client no longer substitutes a fresh revision. Proposal approval now applies within the existing approval transaction and notifies once after resolution.

Verification: `npm test` passed 112 tests in 23 files; `npx tsc -b`, `npm run lint`, `npm run build`, and `git diff --check` passed. Added stale metadata/delete/undo and approval notification regression tests, and verified the CLI sends the original revision without refreshing/retrying a conflicting mutation. Remaining: desktop mutation errors/draft interactions need complete UX tests, project/import transport still needs shared transactional service and removal of renderer-supplied file paths; full upgrade remains in progress.

### Atomic desktop folder import checkpoint

Removed privileged filesystem reads from project import IPC: the renderer reads only dropped File objects and sends bounded names/content. The main service rejects path payloads, limits imports to 50 files and 8 MiB, and creates the project/notes/history/links in one transaction. Project CRUD and reorder IPC now route through KnowledgeService and its post-transaction notification. Regression coverage proves failed normalized content rolls back an already-started import, rejects path payloads/oversized file counts, and verifies backlinks, import provenance and notification count for successful imports.

Verification: `npm test` passed 113 tests in 23 files. Desktop interaction tests, import error presentation and CLI folder-import unification remain outstanding; this checkpoint does not claim the full hardening goal is finished.
Typecheck (through build), production build, lint and diff whitespace checks also passed for the import checkpoint.

### Routing-log privacy and retention checkpoint

New libraries default routing logs to off. Existing opt-in settings remain respected, but persisted logs now omit user-message excerpts, routing reason text and provider fallback text. A one-time startup cleanup removes those fields from existing logical rows. Settings expose metadata logging, 7-day/30-day/forever retention (30 days by default), and explicit deletion. Retention runs at startup, read, write and policy change. This intentionally offers metadata only, not a new excerpt mode. Historical backups are not rewritten; existing copies may retain historical excerpts, and logical deletion is not a forensic secure-erasure claim.

Verification: full suite passed 115 tests/23 files, including disabled defaults, metadata filtering, expiration, forever retention, deletion and legacy reopening cleanup. Lint and production build passed. Final UI typecheck rerun after switching deletion feedback to React state. Remaining full-goal work includes history-retention UX, full desktop tests, benchmarks, provider registry/capability work and consolidated release verification.

### Reviewable history-retention checkpoint

Backup settings now expose revision count and approximate snapshot bytes. Manual cleanup offers retention of 20–1000 newest revisions per note, a concrete preview with deletion count/bytes, explicit application and cancellation. The DB supports validated 20–10000 retention and streams candidate identities into a fingerprint; application checks that fingerprint inside the deletion transaction. New revisions that alter the candidate set invalidate approval. Window-function candidate selection replaces the old per-revision correlated retention query. No automatic deletion is enabled. Current note records, retained snapshots, deleted-note recovery points and existing backups are preserved.

Database regression tests verify per-note limits, stale previews, unchanged active notes and successful recovery from retained snapshots. A rendered React test verifies preview-before-delete and changing retention invalidates the pending preview. Fixed Vitest discovery to include `.test.tsx` (it previously silently excluded these files) with automatic JSX transformation. Initial full DB suite passed 116 tests; focused UI test passed; full suite rerun after the discovery fix. Lint, production build and typecheck passed. Complete desktop/manual verification and remaining full-hardening requirements are still outstanding.
Final full run: 117 tests passed in 24 files after TSX discovery; final changed-test/config lint passed.

### Transactional memory capture checkpoint

Added schema 12 content-hash backfill, index and maintenance triggers; the shared capture operation checks exact normalized content within a project and creates only when no active match exists. Duplicate responses return bounded summaries and do not merge tags or mutate history. Capture dry-runs roll back project creation too. The authenticated API advertises memory capture; CLI capture/decision/todo/summary now use it, default to dedupe, support `--no-dedupe`, and append optional source/session provenance as normal Markdown. Removed hardcoded Codex tagging and fictitious cheap-route output from deterministic capture.

Full verification passed 118 tests in 24 files, including exact duplicate/project isolation, trigger refresh after editing, rollback, and real CLI repeat-capture/provenance through HTTP from outside the checkout. Lint/build verification pending completion below. Full upgrade still needs consolidated verification/CI, latest benchmark evidence, provider registry/capabilities, desktop validation and final requirement audit.
Lint, production build/typecheck and whitespace checks passed for this checkpoint.

### Consolidated verification and CI checkpoint

Added `npm run verify` chaining format check, lint, the entire offline test suite and the production/typecheck build. Added `format:source`, `format:check` and `benchmark` scripts. Normalized existing source/config formatting to make the new check enforceable; historical documents and immutable benchmark records were not reformatted. GitHub Actions uses pinned checkout/setup-node commit IDs resolved from their official v4 references, read-only permissions, concurrency cancellation, Node 22, and Linux/macOS jobs with clean `npm ci`, verification, high-severity dependency audit and CLI package-manifest smoke. Remote CI has not run until pushed; `npm pack --dry-run` does not prove packaged native Electron execution.

The latest intermediate synthetic run is preserved as `after-schema12.json`: 50k summary list 0.79 ms, search 166.39 ms, tags 13.02 ms, update/link maintenance 2.42 ms, related 2.53 ms. Ranked search is slower than the early unranked intermediate result and remains a profiling target. This run overlapped verification and retains the sparse-link/literal-newline fixture limitations; it is not the final isolated performance proof. Audit reported zero vulnerabilities.
The consolidated `npm run verify` command completed successfully: formatting, lint, 118 tests in 24 files, TypeScript and production build. CI execution awaits push; full goal remains active.

### Ranked search and exact-tag performance checkpoint

Replaced per-result correlated FTS scoring with one materialized score set, and narrowed the outer query to a union of FTS/project candidate IDs. A first experiment materializing scores while still scanning all notes regressed to 254 ms at 50k and was rejected; candidate selection is required. Exact active-tag filtering now uses the existing note_tags index instead of per-note JSON scans; deleted-inclusive filtering retains its correct JSON fallback.

The final intermediate fixture run is preserved in `after-candidate-search.json`: 50k ranked search 4.83 ms versus 166.39 ms in `after-schema12.json`, exact-tag listing 7.20 ms versus 55.58 ms. Final run did not overlap verification, whereas the earlier measurement did, so these are indicative comparisons rather than controlled isolated ratios. Sparse-link and literal-newline fixture limitations remain. Added a regression combining exact-title/prefix/BM25 ranking, project-only matches, literal wildcard tags and pagination. Focused 17-test DB suite passed; consolidated verification rerun follows.
Final `npm run verify` passed formatting, lint, all 119 tests/24 files, typecheck and production build.

### Explicit provider/model selection checkpoint

Forced models now resolve exact provider-qualified catalog identities instead of guessing from DeepSeek/Kimi substrings or silently choosing the premium provider. Catalog construction respects configured cheap/premium provider IDs and invalidates its cache when those IDs change. Chat selections persist `provider::model`, preserving distinctions when the same model name exists on multiple endpoints. Legacy unqualified names work only when uniquely resolvable; unknown or ambiguous names require a fresh explicit selection. The UI displays provider/model labels.

Fixed Auto chat selection: IPC no longer converts an empty selection into a forced OpenAI model, so configured routing executes. Forced selection no longer initializes an unrelated routed provider first (and fails on that provider's missing key). Added exact-selection, ambiguity, unknown-model, catalog-cache and IPC Auto/qualified-selection tests. Provider capability conformance and end-to-end fallback evaluation remain outstanding parts of the full goal.
Verification: format check, lint and all 123 tests/26 files passed. Typecheck found an optional-options reference in the route explanation; replaced it with the already narrowed local selection. Final production build/typecheck and changed-file lint passed after correction.
