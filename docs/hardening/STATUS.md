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

The latest intermediate synthetic run is preserved as `after-schema12.json`: 50k summary list 0.79 ms, search 166.39 ms, tags 13.02 ms, update/link maintenance 2.42 ms, related 2.53 ms. Ranked search is slower than the early unranked intermediate result and remains a profiling target. This run overlapped verification and retains the sparse-link fixture limitations (the newline concern was corrected below); it is not the final isolated performance proof. Audit reported zero vulnerabilities.
The consolidated `npm run verify` command completed successfully: formatting, lint, 118 tests in 24 files, TypeScript and production build. CI execution awaits push; full goal remains active.

### Ranked search and exact-tag performance checkpoint

Replaced per-result correlated FTS scoring with one materialized score set, and narrowed the outer query to a union of FTS/project candidate IDs. A first experiment materializing scores while still scanning all notes regressed to 254 ms at 50k and was rejected; candidate selection is required. Exact active-tag filtering now uses the existing note_tags index instead of per-note JSON scans; deleted-inclusive filtering retains its correct JSON fallback.

The final intermediate fixture run is preserved in `after-candidate-search.json`: 50k ranked search 4.83 ms versus 166.39 ms in `after-schema12.json`, exact-tag listing 7.20 ms versus 55.58 ms. Final run did not overlap verification, whereas the earlier measurement did, so these are indicative comparisons rather than controlled isolated ratios. Sparse-link fixture limitations remain; the newline concern was corrected below. Added a regression combining exact-title/prefix/BM25 ranking, project-only matches, literal wildcard tags and pagination. Focused 17-test DB suite passed; consolidated verification rerun follows.
Final `npm run verify` passed formatting, lint, all 119 tests/24 files, typecheck and production build.

### Explicit provider/model selection checkpoint

Forced models now resolve exact provider-qualified catalog identities instead of guessing from DeepSeek/Kimi substrings or silently choosing the premium provider. Catalog construction respects configured cheap/premium provider IDs and invalidates its cache when those IDs change. Chat selections persist `provider::model`, preserving distinctions when the same model name exists on multiple endpoints. Legacy unqualified names work only when uniquely resolvable; unknown or ambiguous names require a fresh explicit selection. The UI displays provider/model labels.

Fixed Auto chat selection: IPC no longer converts an empty selection into a forced OpenAI model, so configured routing executes. Forced selection no longer initializes an unrelated routed provider first (and fails on that provider's missing key). Added exact-selection, ambiguity, unknown-model, catalog-cache and IPC Auto/qualified-selection tests. Provider capability conformance and end-to-end fallback evaluation remain outstanding parts of the full goal.
Verification: format check, lint and all 123 tests/26 files passed. Typecheck found an optional-options reference in the route explanation; replaced it with the already narrowed local selection. Final production build/typecheck and changed-file lint passed after correction.

### Provider fallback execution-state checkpoint

Cheap/premium fallback now shares turn count, total tool-call count, applied-write state and pending proposal IDs. A failed cheap response no longer erases approval state or resets the global tool budget. Budget-exhaustion responses still surface pending approvals. Premium escalation is restricted to Auto routing without an explicit model selection; cheap-only and locked-model choices are respected.

Committed tool writes now notify the desktop immediately, including when both providers later fail, rather than waiting for a successful final response. Added actual runner tests with scripted offline providers covering pending proposals across fallback, existing tool-result protocol, applied writes without replay, cumulative tool limits, cheap-only policy and notifications after double failure. No live provider calls were used. Full goal remains active; capability conformance and remaining release/desktop requirements are not yet complete.
Final consolidated verification passed formatting, lint, 128 tests/27 files, TypeScript and production build.

### Installed CLI package verification checkpoint

Added `npm run package:verify`: packs the real distributable, installs production dependencies into an isolated temporary directory, checks the CLI bin link/executable bit, launches the installed CLI server against a synthetic library, authenticates, captures/deduplicates/searches through installed commands from outside the repository, and verifies clean termination. Fixed CLI server signal forwarding so stopping the wrapper stops its database-owning child. CI now executes this smoke test rather than only listing tarball contents. This does not claim Electron DMG/NSIS/AppImage, signing or notarization validation.

The initial installed-runtime smoke passed. The additional bin-link assertion exposed macOS `/var` vs `/private/var` path aliasing in the verifier; it now compares realpaths on both sides. Final smoke rerun follows. Source verification is recorded below.
Final installed package smoke passed, including canonical bin-link/executable checks. `npm run verify` passed formatting, lint, all 128 tests/27 files, TypeScript and production build. Remote CI and Electron package validation remain outstanding.

### Electron native package checkpoint

Built an unsigned macOS x64 application directory with Electron 41.10.3 using electron-builder. Executed its bundled binary in Electron's Node mode, loaded better-sqlite3 from app.asar, and verified SQLite 3.53.4 plus an FTS query. Added `package:electron:verify` to build a temporary directory package and check bundled main/preload/renderer assets, SQLite loading, FTS and quick_check without opening the user library. This is not a renderer interaction test or signed installer validation.

The pre-existing configured PNG/ICNS/ICO release assets were ignored with the whole build directory; narrowed ignores so the three required icons can be tracked and clean checkouts can package them. macOS CI now includes the unsigned directory/native check. Signing/notarization, Windows NSIS and Linux AppImage remain unverified. Final reusable-script and source verification results follow.
Reusable unsigned macOS x64 check passed: Electron 41.10.3, SQLite 3.53.4, bundled assets/FTS/integrity. Source `npm run verify` passed formatting, lint, 128 tests/27 files, typecheck and build. No signing was attempted; full hardening goal remains active.

### Custom-provider capability checkpoint

Custom endpoints now have explicit tools, system-message and temperature capabilities in Settings. Their adapter omits unsupported tools/tool_choice/temperature fields; when system messages are disabled, instructions are carried as user text. Text-only endpoints cannot consume a tool-result transcript and unexpected returned tool calls are rejected before execution. Existing provider defaults remain enabled for compatibility. Settings IPC validates the capability object; runner resolution passes it through configured and forced custom-provider paths.

Added offline request-shape and capability-rejection tests. Typecheck caught test-fixture/tool-type and duplicated-default issues, which were corrected. Final verification result follows. Desktop interaction, broader provider compatibility and remaining full-goal audit work are still open.
Verification passed all 131 tests/28 files, formatting and lint. After explicitly typing the conformance fixture, final TypeScript/production build and changed-file lint passed. Full hardening goal remains active.

### History navigation race checkpoint

Note-history state is now scoped to the selected note through a keyed component. Snapshot requests use a generation guard so a slower earlier response cannot replace a later selection. Historical restore retains the note revision read when that snapshot was selected, rather than silently adopting a newly refreshed revision after an external mutation.

The existing full verification command passed formatting, lint, 131 tests/28 files, typecheck and production build. Two additional rendered UI tests passed for response ordering/note switching and preserving the original restore revision after an external write; their lint passed and they were included in the final TypeScript build. Broader desktop interaction and remaining full-goal requirements remain outstanding.

### Verified backup retention and restore checkpoint

Desktop backups now use atomically allocated unique directories, verify SQLite before success, set private permissions, and record timestamp/reason/schema/integrity metadata. Failed attempts remove their newly allocated directory. Optional automatic retention keeps 7/30/90 recognized verified automatic backups; the default keeps all. Manual, pre-restore and unrecognized historical backups are preserved. The just-created verified backup is protected when timestamps tie, and retention-cleanup failure preserves it.

Added database-backed tests for concurrent manual backups, retention, metadata, restoring a chosen backup with revision history, and failed-output cleanup. Added an administrative Python-script regression using a live WAL source: verifies knowledge survives, credentials are absent from copied rows and physical bytes, the original credential remains unchanged, manifest metadata is correct and destination permissions are private. These checks use only synthetic libraries. Final source verification follows; full goal remains active.
Verification passed formatting/lint, the full 135-test/30-file suite and production build. The additional administrative-backup test and its lint passed separately; final typecheck included it. No live user data was read or changed.

### Full-scope gap reconciliation and hydration safety checkpoint

Replaced placeholder-only requirements rows with a 60-step working evidence/gap ledger. It explicitly preserves outstanding standalone secret behavior, legacy transport consolidation, granular invalidation, desktop/e2e/profile work, final controlled benchmarks/budgets, remote CI and release/documentation audit. Scoped implementation evidence is not a final completion claim.

Fixed delayed note hydration: removed notes are not resurrected, older responses cannot replace newer loaded revisions, and an external revision arriving during a draft preserves its original base and surfaces conflict. Added two concurrency regressions. `npm run verify` passed formatting/lint, 138 tests in 31 files, TypeScript and production build. Full hardening goal remains active.

### Standalone credential boundary checkpoint

The standalone server now fails closed before binding HTTP if known legacy provider values or a pending credential-sanitization marker remain. It closes its database handle and reports a migration-required error without deleting the only credential copy. Desktop startup now honors the same explicit STRATA_USER_DATA_DIR as standalone, enabling secure desktop migration of non-default libraries. Standalone remains a knowledge API without provider-key configuration/decryption.

Tests cover fresh/legacy/migrated/pending states, preservation of the original key, successful migration through the secret-store contract, and an actual standalone subprocess refusing a pending library. Full verification and focused subprocess tests passed; final result recorded below. This closes the unsafe standalone-startup behavior, but OS-specific desktop/end-to-end validation and the complete release audit remain outstanding.
Final verification passed the 139-test/31-file suite, formatting/lint, TypeScript and production build. Focused credential/subprocess tests and final typecheck passed. Installed CLI fresh-library smoke passed on retry after one host EAGAIN spawn failure; no application data was involved in that transient host failure.

### Real desktop interaction checkpoint

Added `desktop:verify` using Playwright Electron against a disposable, explicitly asserted user-data directory, an ephemeral authenticated API port, and no AI provider calls. The actual renderer creates a note, edits through CodeMirror, waits for persisted revisions through the sandboxed preload, reloads/reopens the note, and restores an earlier revision through the history UI. It also verifies Node globals and a shell API are absent from the renderer. Passed twice including history restore; npm install audit reported zero vulnerabilities. Added the separate macOS CI step and usage documentation. This is scoped interaction evidence, not full desktop/installer/platform coverage.

The initial concurrent full suite exceeded the five-second deadline of the multi-backup integration test (138 other tests passed). That test performs multiple verified SQLite backups plus restore; its individual deadline is now 30 seconds. Verification is being rerun without concurrent Electron work. No user-library data was used. Full goal remains active; unresolved requirements remain in requirements.md.
Final checkpoint validation: formatting/lint and all 139 tests in 31 files passed. npm could not spawn the build shell once (host EAGAIN); the separate production-build retry passed TypeScript and all Vite outputs. The final isolated desktop script passed with asserted library path and guaranteed fixture cleanup. Remote CI has not been run. Commits remain local until the full-goal publication stage.

### Quick Open beyond the sidebar cache

Quick Open now uses debounced database summary search (30 results), preserves database relevance ordering and materialized titles, ignores superseded requests, and shows search/open failures. Selecting a result loads an uncached note before opening it; concurrent cache additions are preserved. A failed current-draft save prevents Quick Open from switching selection. Other link/chat navigation remains a separately tracked gap.

Added rendered regressions for uncached selection and delayed-result/failed-open behavior. Source verification passed formatting/lint, 141 tests in 32 files, TypeScript and production build; final focused lint also passed. Extended the isolated Electron check to generate more than 100 notes, prove the target is absent from the first page, then search/open it through Quick Open. Desktop result follows.
The expanded real Electron check passed: target absent from first 100 summaries, Quick Open search found it, and its body loaded in CodeMirror. An initial harness assertion mistakenly expected an H1 in the body editor (Strata displays it separately); the corrected fixture includes a distinct body assertion. All data remained synthetic and temporary. No goal-completion claim; other gap-ledger items remain.

### Shared navigation safety checkpoint

Added a shared async navigation action for Quick Open, chat, home and related-note callbacks. It loads uncached targets, hydrates summary-only targets, rejects missing/deleted notes, waits for current-draft persistence before switching, reports failures visibly, and ignores superseded or late navigation requests. Pending targets survive sidebar refresh during a draft save. Quick Open delegates to this action instead of duplicating its save guard.

Five store regressions cover uncached tabs, failed draft saves, late responses, missing notes and refresh during save. Full verification passed formatting/lint, 145 tests in 33 files and production build; the added fifth focused regression and focused lint passed separately (146 total tests now). A process security test initially exceeded its default five-second test deadline despite its child having a ten-second deadline; the outer test deadline is now twenty seconds and its rerun passed. Expanded desktop related-navigation result follows. Wiki-link cache resolution and remaining broader requirements are still open.
The corrected real Electron check passed: with both target notes older than the first 100 summaries, Quick Open loaded one and the related-note modal opened the other. The harness now explicitly expands the default-collapsed note-actions toolbar. One attempted rerun hit the host process limit before that edit could execute; after verifying the edit and waiting for the prior process to terminate, the final run succeeded. Full goal remains active; no user data was used.

### Indexed wiki-link navigation and atomic missing-note creation

Wiki-link clicks now resolve through indexed database lookup instead of inferring absence from the renderer cache. Existing uncached notes open through the shared safe navigation action without a creation prompt. Missing targets require the existing explicit confirmation, then use a domain-service transaction that rechecks existence and creates the full titled note with one revision. This removes the old blank-create followed by revision-less update (which could leave an unwanted blank note). The service notifies only after an actual committed creation. Invalid encodings/targets and lookup failures surface a navigation error and never trigger speculative creation.

Added three navigation regressions and one real SQLite service regression covering indexed retrieval, approval/cancellation, invalid targets/lookup failures, deduplication, revision count and notifications. Full source verification passed formatting/lint, 149 tests in 34 files, TypeScript and production build; the additional database regression and final focused lint passed separately (150 tests now). The expanded isolated Electron script passed Quick Open, preview wiki-link navigation to an uncached note beyond the first 100 rows with no create prompt, and related-note navigation, alongside editing/history/sandbox checks. Full goal remains active; remaining requirements are recorded in requirements.md.

### Atomic CLI folder imports and real import dry runs

Added authenticated `POST /v1/projects/import`, using the same bounded, title-normalizing import service as desktop. The service supports transactional dry runs and idempotency options, preserves import revision provenance, and notifies only for applied imports. API results use summaries. CLI folder imports submit one transaction instead of creating a project and then notes in separate requests. Inputs are bounded to 50 files, 790,000 bytes/file, 900,000 source bytes and an encoded request no larger than 1 MiB. Folder and single-file imports require confirmation or dry-run; single-file dry-run no longer writes a note. Updated examples and protocol/limit documentation.

Full source verification passed formatting/lint, 150 tests in 35 files, TypeScript and production build. A new actual CLI/API integration test passed separately, proving both dry-run forms leave notes/projects/history unchanged, successful folder imports preserve import revisions and compact output, and a later invalid file rolls back the entire import. Final focused lint and diff whitespace check passed (151 tests now). No user library was accessed. Full goal remains active.

### Explicit ambiguous wiki-link selection

The private desktop lookup contract now distinguishes missing, uniquely resolved and ambiguous titles. Indexed lookup returns at most 20 summaries, without full note bodies. Ambiguous links show a scrollable choice list with title, timestamp and snippet; only an explicit selection navigates. They never prompt to create a missing note. The creation transaction independently rejects ambiguous titles, preventing another duplicate if the title set changes while the confirmation prompt is open. Existing graph resolution continues leaving ambiguous edges unresolved rather than selecting an arbitrary target.

Database and navigation regressions cover duplicate rejection and no implicit creation/navigation. Full suite passed 152 tests in 36 files with formatting/lint. TypeScript initially rejected a parameter-property constructor under this repository's erasableSyntaxOnly setting; it was corrected to an ordinary field assignment. The subsequent production build and final targeted lint passed. Real isolated Electron verification passed selecting the intended second matching note with no create prompt, alongside the existing editor/history/navigation checks. Full goal remains active; unresolved styling/rename behavior and other scope items remain in the gap ledger.

### Runtime logging privacy audit

Audited first-party console/log sinks in main, standalone, preload, renderer and CLI. Raw main/backup/standalone/renderer exceptions now reduce to an allowlisted code; unknown codes/messages/stacks/objects never serialize into those logs. Standalone startup/recovery messages omit user-library paths. CLI request diagnostics omit URLs and queries. Startup checkpoints require explicit STRATA_DEBUG=1 and remain fixed text. Renderer error/rejection handlers suppress default raw browser reporting, React callbacks use sanitized reporting, and the crash screen shows a safe code instead of exception text/stack. Deliberate CLI data responses and exports remain distinct from diagnostics.

Full verification passed formatting/lint, 154 tests in 37 files and production build. Added a final CLI verbose privacy regression; the focused three-test logging suite, final lint and TypeScript checks passed (155 tests now). The actual Electron check injected an uncaught error containing a synthetic private marker: logs showed only UNEXPECTED_ERROR and did not contain the marker. All prior desktop interaction checks also passed. Tests used synthetic data only. Remaining requirements in the ledger keep the full goal active.

### Per-note save and conflict state

Replaced the global save status/timestamp with note-keyed save states. Each EditorPane subscribes to its own status and uses its own note timestamp; conflict recovery is rendered inside and bound to that pane, regardless of the selected note. Saving another note cannot clear the conflict. Further typing keeps the conflict visible, and known-conflicted drafts no longer repeatedly autosave against a stale revision. Failed saves expose a retry control; missing update results are failures rather than indefinite saving. Added concurrent-save and pane-recovery regressions. Ordinary editor clicks now place the caret; wiki-link navigation from the editor requires Ctrl/Cmd-click, while preview links retain normal clicks.

Full source verification passed 157 tests in 38 files, formatting/lint and production build after fixing one pre-existing formatter mismatch in standalone/server.ts. Subsequent focused save/recovery tests, final lint and the updated production build passed. The extended Electron fixture uses keyboard editing, explicitly opens the required tab before pinning, and passed twice: an independent IPC writer changes the pinned note, its stale GUI draft remains conflicted/preserved, the active pane saves another note, and stored external content is unchanged. Earlier fixture failures involved editing wiki text and an absent tab after reload; those interactions were corrected instead of asserting success from the failed runs. Other existing desktop checks passed too. This is scoped split-pane evidence, not completion of the full hardening goal.

### Production file-document CSP and real navigation enforcement

Found that production loaded file:// HTML while CSP was only supplied as a response header. Added one shared production policy and a build-only Vite HTML transform that embeds it as the first head meta element; main response headers reuse the policy. Development retains its existing HMR policy. This follows Electron’s file-document CSP guidance (https://www.electronjs.org/docs/latest/tutorial/security).

Full npm run verify passed formatting/lint, 157 tests in 38 files, TypeScript and production build. The isolated real Electron check passed: the emitted CSP meta exists, an inline script raises script-src violations and never executes, renderer navigation to a synthetic file is prevented, and window.open returns null without creating another window. Existing editor/history/search/conflict/privacy checks also passed. Explicit permission handling and the remaining requirement ledger still need work; this is not a full completion verdict.

### Default-deny desktop permissions and current security guidance

Installed both Electron permission handlers before window creation. Only the exact app document in the main WebContents/main frame can request audio capture or sanitized clipboard writes. Camera/mixed/unknown media, location, other permissions, missing or foreign URLs, child frames and auxiliary windows fail closed. The policy checks the loaded document as well as the requesting frame. Audio remains subject to OS permission; verification uses Chromium’s synthetic device without bypassing the permission UI policy.

Full npm run verify passed 159 tests in 39 files, formatting/lint, TypeScript and build. Real isolated Electron verification passed audio acquisition/stopping through the synthetic device, camera NotAllowedError and denied geolocation, followed by all existing editing/history/navigation/conflict/CSP checks. No real microphone or user library was accessed.

Corrected root SECURITY.md’s stale optional-auth and arbitrary-shell guidance to current boundaries and explicit review invariants. Retained reporting/support/disclosure terms and introduced no exclusions or accepted risks. Security policy inventory found only the root first-party policy; the resolver confirmed the root chain for app/main. Remaining release and boundary validation stays explicit in the requirement ledger.

### Central IPC sender validation

Every privileged invoke registration now uses handleTrustedIpc. Dispatch fails closed until configured, and requires the current main WebContents, its main frame, and the exact app document URL (a fragment is harmless). Another window, a child/detached frame, a different file/web URL or query, and a closed main window cannot read or mutate through the bridge. Main initializes the guard before registering handlers. Added denial-before-dispatch regressions and an architectural check preventing direct ipcMain use in handler modules; the routing test now supplies an authenticated fixture frame. AGENTS.md and SECURITY.md document the boundary.

Formatting and lint passed. The first full test runner exited early without a suite summary; rerunning npm test -- --maxWorkers=2 --minWorkers=1 passed all 161 tests in 40 files. npm run build then passed TypeScript and production builds. Real Electron verification passed a note-read denial from an auxiliary window carrying the same preload, plus all existing editing/history/conflict/permission/CSP/navigation checks. The first auxiliary fixture used a preload path recovered from WebPreferences and failed before invoking IPC; the successful fixture explicitly uses the verified built preload path. This correction changes the test setup, not the production boundary.

Follow-up source audit found obsolete full-note list/listSummaries methods still exposed through private preload although the renderer now uses pages, and CLI project counts derived from only one note page. These remain in-scope work to resolve, not completion claims or separate downstream tasks.

### Remove obsolete full-list preload methods

A call-site audit found no renderer consumers of the old notes.list/listSummaries service methods. Removed those methods from the renderer service, typed preload API, bridge, IPC channel catalog and handlers. Desktop retrieval now exposes bounded summary pages and explicit single-note reads. The real desktop fixture also uses summary pages and asserts both old bridge methods are absent. Existing HTTP/CLI contracts and explicit full reads are unchanged.

Production TypeScript/build passed; targeted ESLint passed directly after npm could not spawn its shell (EAGAIN). Real Electron verification passed all existing checks with the reduced bridge. An initial Electron attempt crashed before completion; the unchanged retry passed, and no matching fixture process remained after the failed attempt. No success claim is based on that crashed run. The last complete offline suite remains 161 passing tests from the preceding IPC boundary change; this removal was checked with compilation, call-site search, lint and actual desktop interaction.

### Correct complete CLI project counts

Fixed projects list deriving counts from one bounded note page, which undercounted large projects and did unnecessary note retrieval even for JSON output. GET /projects now returns SQL project summaries with noteCount, using the existing project-note index. Counts cover all non-deleted notes, including archived notes, and empty projects return zero. The CLI validates this summary shape and uses the same count in JSON and human tables. Project create/reorder contracts retain their existing project records. Documented the count semantics in API.md and CLI.md.

A real CLI/API regression populated 128 notes in one project (13 deleted, seven archived), another project with six notes, an empty project and an unassigned note. Both output modes reported 115/6/0, and a spy proved no note page was fetched. The focused CLI suite passed six tests across three files; TypeScript/production build and targeted ESLint passed. This brings the source test inventory to 162, with the preceding complete suite at 161. All data was synthetic.

### Benchmark fixture correction

Rechecked the source and evaluated the original benchmark’s actual template literal. It contains real linefeeds and no literal backslash-n sequence. Earlier checkpoint prose describing a literal-newline limitation was incorrect and has been corrected; immutable benchmark JSON artifacts are unchanged. The real limitations remain raw seeding without a populated graph, narrow/common tag distributions and differences in query contracts or concurrent load between some historical runs. New adverse sparse-tag measurements are being recorded separately with a named, reproducible workload.

### Indexed related-tag candidates and controlled sparse-tag measurements

Replaced the related-note shared-tag JSON scan with a seek through idx_note_tags_tag, deduplicating at most 100 other active-note candidates. Multiple matching tags contribute one shared-tag signal. The current note is read as tags/project metadata instead of a full body; deleted current notes return no candidates. Added regressions for rare matches beyond 100 unrelated notes, combined link/tag scores, bounded snippets/no current-body hydration, tag updates, restored/deleted notes and archived matches.

The separately named related-sparse-tags-v1 workload ran sequentially before and after the change at 100/1k/10k/50k notes with 15 warm samples per case and no concurrent verification. At 50k, rare-tag median fell from 203.479 to 1.205 ms; no-shared-tag median fell from 194.810 to 0.914 ms; dense-tag median was 2.460 versus 2.236 ms. Result counts remained 1/0/8. Immutable raw measurements and the full comparison/limitations are in related-tags-before.json, related-tags-after.json and related-tags.md. This isolates tags, not project pools, graph density or end-to-end UI latency.

Full npm run verify passed formatting/lint, 163 tests in 42 files, TypeScript and production builds. The test runner now bounds native/subprocess suite fan-out to two workers following the earlier unbounded-run failure and successful bounded rerun. Remaining requirements keep the overall goal active.

### Isolate PDF and print documents

PDF/print data documents now prepend a restrictive CSP before caller HTML, including a caller-supplied policy. Inline layout and data-embedded images/fonts are permitted; scripts, remote/local-file resources, base URLs, forms and frames are blocked. Both handlers share strict payload validation with an 8,388,608-character HTML limit. Existing JavaScript-disabled, sandboxed, navigation-protected auxiliary windows remain in use. SECURITY.md records these boundaries.

Three focused export/IPC tests passed, followed by TypeScript/production build and targeted lint. The real Electron check produced PDF bytes, observed the policy at the start of the actual auxiliary document, and recorded zero attempted image/CSS requests to an ordinary loopback port despite a weaker caller policy. It also passed all existing editor/history/search/conflict/permission/IPC/CSP/privacy checks. An earlier run produced PDF bytes but timed out on the existing five-second history-restoration check; the final run passed. The network fixture was tightened from a restricted browser port to an ordinary port before the successful final run. Physical printer interaction and full visual PDF layout are not claimed. Latest complete offline suite remains 163; the added export test brings the inventory to 164.

### Bound HTML publishing and pin its approved directory

Publishing now validates destination/title/HTML bounds and rejects unknown payload fields. It writes through the canonical directory authorized by the native picker, instead of reusing the originally selected alias after validation. Filenames remove path/control characters, shorten at Unicode code-point boundaries to a bounded UTF-8 filename and prefix common Windows device names. Exclusive creation still refuses overwrites. Current publishing documentation replaces obsolete shell-adapter instructions; the original design is preserved under docs/history with an explicit superseded banner. SECURITY.md reflects the verified boundary.

A filesystem/IPC regression changes a directory symlink immediately after canonical resolution and verifies the write stays in the approved directory. It also verifies repeat-export refusal, unchanged original content, unapproved destinations, oversized HTML and long/reserved filenames. The native picker itself is mocked; this is not a native-dialog UI test. The initial fixture compared a macOS /var alias to its /private/var canonical path and was corrected to use a canonical temporary root. A subsequent esbuild spawn hit EAGAIN, and another runner exited without a final summary; the single-worker rerun passed all four focused publisher/IPC/export tests in three files. Direct TypeScript/Vite production build and targeted ESLint then passed. Latest complete offline suite remains 163; export/publisher additions bring the inventory to 165.

### Preserve drafts when closing tabs

Found and fixed direct tab closure deleting an in-memory draft without waiting for persistence. closeTab now awaits its save and refuses to close if a failed/conflicted or newly changed draft remains, showing a recoverable inline message. Successful saves close normally. Tab selection also uses the shared safe navigation path rather than activating unconditionally after a failed flush.

Added regressions for failed/conflicted closure, waiting for acknowledgement, and text arriving while a closing save is pending. Fourteen focused autosave/navigation tests passed, followed by TypeScript/Vite build and targeted lint. Real Electron verification clicked the close button on the conflicted pinned tab and confirmed that its tab, pane and draft remained visible; all existing desktop checks passed. Latest complete offline suite remains 163; the current inventory is 168. Stale save acknowledgement and broader metadata reconciliation remain under review.

### Preserve draft intent across delayed responses and recovery

Pending saves now remember the highest revision observed through listing, hydration, open-note refresh, recovery and metadata responses. A stale acknowledgement cannot clear a newer conflict, remove its draft or replace fresher cached data. Matching own-write echoes complete normally. Older summary/full reads no longer regress the cache or create false conflicts. Metadata responses share a revision guard. Late failures do not reintroduce an error after recovery, and an acknowledgement at the already-recovered revision remains saved.

Also fixed empty-note cleanup discarding text entered while its delete request was pending, and recovery discarding text entered while copy/reload was pending. Recovery preserves fresher cached revisions and only clears the draft snapshot the user actually chose to recover/discard. External deletion removes clean open notes while preserving dirty notes with a conflict. Successful tab closure clears its old navigation error.

Full npm run verify passed formatting/lint, 182 tests in 45 files, TypeScript and production builds. The response-ordering/closure suite covers 28 focused cases across three files, including 13 delayed-response/recovery cases. An intermediate parameterized test retained an old fixed expected revision and was corrected before the final passing run. The real Electron check also passed: closing a conflicted tab preserves it, saving its draft as a new note creates one recovered note with the original draft text, and the correct pinned pane reloads the external version. All prior desktop security/editor checks passed. The ordering permutations are deterministic store tests; the desktop check proves normal interaction wiring.

Remaining lifecycle audit: application close/quit currently has no renderer draft-save handshake, and before-quit closes the database. Graceful application close/reload protection must be handled before overall completion. Other requirements remain in the gap ledger.

### Graceful application close and reload draft protection

Window close and application quit now request renderer draft persistence before closing the window or database. A single close coordinator combines repeated close/quit requests, rejects unknown or late replies, and invalidates old requests when the window changes. Failed/conflicting drafts or an unresponsive renderer lead to a native Keep Editing / Discard Drafts and Close choice with Keep Editing as default/cancel. Database/API/backup shutdown moved from before-quit to will-quit. Renderer editing and menu commands are suspended during the save handshake. Reload uses beforeunload protection and an explicit discard choice for dirty/conflicted drafts; identical saved content does not trigger that prompt.

Eleven focused tests cover save acknowledgement, combined close/quit requests, explicit discard, timeout and late replies, window replacement, failed confirmation, renderer editing suspension, cancellation, reload protection, and flushing all drafts. Full npm run verify passed 193 tests in 47 files plus formatting, lint, TypeScript and production builds. The desktop fixture now checks cancelling quit with a conflict and immediately quitting after editor input, then reopens the same disposable library to check persistence. The final real Electron run passed the quit-cancellation and persisted-draft restart checks plus every existing desktop check. Earlier attempts exposed fixture ordering after deliberately denied navigation, assumptions about restored editor/sidebar visibility (the app starts on Home), and an exact body assertion that omitted the editor-preserved Markdown title. Those fixture assumptions were corrected before the passing run.

This protects graceful window close/quit/reload, not force-kill, process crashes or OS shutdown paths that do not emit Electron before-quit/will-quit. Backup restoration deliberately replaces the library through its separate confirmed restore flow and requires its own remaining lifecycle audit. The broader goal and gap ledger remain open.

### Carry committed domain invalidation through every desktop transport

Removed the notesChanged Boolean and notes:changed event from first-party code. Shared ChangedDomains now flows from KnowledgeService through AI tool execution and fallback state, API callbacks, trusted IPC and the preload data:changed listener. Project creation/reordering invalidates projects only; rename also invalidates search results; note/tag/project-assignment/deletion operations cover their dependent note, graph, count and history views. Proposal approval reports its actual operation domains. Idempotent mutation/batch/import replays, dry-runs and rolled-back operations do not emit mutation events. The API project-reorder route now uses the shared mutation/idempotency path.

The renderer coalesces event bursts and serializes resulting refreshes. Project-only changes no longer read note pages, tags or settings. Backlink/related panels, visible revision/AI history and history-storage statistics subscribe to their domain versions. Graph requests ignore responses from an older note/version. An open history list updates without discarding the historical snapshot being reviewed or advancing its expected restore revision.

Full npm run verify passed formatting/lint, 200 tests in 49 files, TypeScript and production builds. New tests cover dependency flags, atomic rollback/dry-run/replay behavior, AI project-only outcomes, coalescing during in-flight refresh, project-only read avoidance, refresh errors and open-history review preservation. Thirty-six existing AI/fallback/response-ordering/autosave tests also passed separately. The native desktop check passed live backlink addition/removal, project-only bridge events, conflicts, recovery, quit persistence and existing security/editor checks. Earlier attempts used edit mode where graph panels are absent, then a title duplicated by draft recovery that correctly remained unresolved; the fixture now uses preview and a unique target. Another run hit a host target crash and was retried only after termination. A final review added a separate history-list request generation to prevent stale manual loads replacing newer invalidation results (four history UI tests passed, current test inventory 201), and consolidated related-modal reads around their target ID and graph version with stale-response protection. Targeted lint, TypeScript, production build and the final real Electron rerun passed for those last UI guards. A host fork-limit error interrupted the initial combined final command; separate commands succeeded after it terminated. No active fixture process remains.

### Propagate AI cancellation through provider execution

Added an optional AbortSignal to the provider-turn contract, shared tool loop and runner. Both Chat Completions and Responses adapters forward it to the bounded request helper. Pre-cancelled requests never connect; abort reasons are not exposed. The loop checks cancellation before provider work, after a response and before each tool invocation. Cancellation does not trigger premium fallback, and previously committed domain changes/proposals remain recorded rather than being replayed or silently rolled back.

Sixteen focused cancellation/provider/fallback tests passed across three files, including both adapter requests, late tool responses, stopping subsequent calls, preserving completed mutation facts and avoiding fallback after an applied write. Targeted lint, TypeScript and production builds passed. End-user request ownership, IPC cancellation, chat Stop controls and transcription cancellation are not implemented by this core slice; step 23 remains partial.

### AI cancellation ownership and controls

The desktop bridge now accepts optional UUID request IDs, exposes a narrow cancellation method and bounds active provider/transcription requests to four. Only the owning renderer may cancel a request; a cancelled request occupies its slot until it actually settles. Destroying the renderer aborts its work and prevents a later chat-message write against a closing database. Chat cancellation returns a persisted status when the thread already exists; applied note changes are retained. Transcription uses the same request lifecycle.

Chat has Stop/Stopping controls; thread switches/deletion and editor teardown cancel the old request and ignore its late response. Stopping the existing simulated typing animation now resolves its pending completion rather than leaving send state stuck. Transcription can be cancelled and ignores late text after cancellation/teardown. Redundant unguarded post-send usage refresh was removed in favor of the existing thread-scoped effect, and older message-list reads cannot replace a newer send.

Core ownership/IPC/routing/provider tests passed (11 focused tests before adding transcription IPC coverage; four IPC tests now pass). The first TypeScript check rejected a constructor parameter property under erasableSyntaxOnly and it was replaced with an explicit field. An intermediate full suite failed because the new transcription IPC test omitted the settings resolver mock; that mock and its rejection handling were corrected. The complete rerun passed formatting/lint, 213 tests in 52 files, TypeScript and production builds. The native Stop check initially exposed the model picker overlapping a new normal-flow button; Stop/Cancel now replace Send in its existing fixed position. Targeted lint/TypeScript/build and the final real Electron run passed after that layout fix. Clicking Stop aborted the synthetic provider request, rendered a cancellation status and restored the Send control. All prior desktop checks passed too. No real AI provider or microphone is used by these fixtures; transcription cancellation is covered through the IPC/provider fixture, not real speech recognition.

The OpenAI environment-key routing observation was confirmed and fixed in the following slice. Project UI counts still need to use complete SQL counts; backup-restore draft preservation and final performance/release deliverables remain in the broader audit.


### Honor OpenAI environment credentials in routed requests

Confirmed that the route settings resolver bypassed the existing OpenAI environment-key helper. It now resolves STRATA_OPENAI_API_KEY before the vault-backed setting while reusing the current settings snapshot. Provider creation rejects absent/blank credentials with AUTH_ERROR before connecting. This also removes the previous OpenAI-specific missing-key exception in the factory.

Eleven focused credential/selection/fallback tests passed. The credential fixture verifies the actual Authorization header using a synthetic key, unchanged saved settings, fallback to vault values for a blank environment variable, one settings read, and no connection with missing credentials. A fixture typing error initially passed the whole settings object as the credential map; it was corrected to the actual string-valued credential projection. Targeted lint, TypeScript, production build and real Electron verification passed. The desktop synthetic transport now checks the routed environment credential before testing Stop; no real provider is contacted. Latest complete suite remains 213; current test inventory is 215.

### Record deterministic agent payload baselines

Added benchmark:payloads, which loads the original e2ca89b tool executor and selected context builders from git, runs original/current read contracts against identical synthetic knowledge, and records source and fixture hashes. The immutable payloads-before-mode-policy.json and payloads.md report UTF-8 bytes, counts, changed semantics and limitations; they do not claim model-specific token counts or database latency.

Default list output fell from 45,182 to 6,872 bytes (60 to 15 summaries). The sampled combined system/open-note/history/catalog content fell from 187,019 to 33,990 bytes. The explicit full-note response grew from 7,309 to 7,372 bytes because of additional metadata. The full catalog grew from 4,925 to 5,302 bytes; a candidate read-only catalog retains all 10 read tools in 2,732 bytes. Benchmark execution, source formatting, targeted lint and diff checks passed. No live database/provider was used.

Follow-up: enable the measured permission-mode subset without intent guessing, and replace slicing of serialized open-note context with complete bounded entries plus an omission count. Preserve this baseline artifact unchanged.

### Permission-based AI catalog and valid bounded context

Read-only and unknown stored permission modes now advertise only the complete read-tool catalog; confirm/auto-apply retain all mutation tools. Runtime mutation checks independently fail closed for unknown values. Runner tests exercise the same catalog through cheap and premium fallback, including rejection of an unsolicited mutation call. Open-note summaries are appended as complete JSON entries within the 4,000-character budget, include an omitted count, and preserve Unicode code points. Escaped content cannot leave a truncated JSON object.

The immutable follow-up payload artifact records 2,732 read-only catalog bytes versus 5,302 full catalog bytes (48.47% reduction). Complete context framing adds 22 bytes to the ordinary fixture (3,570 total); combined read-only content/catalog is 31,442 bytes versus original 187,019. Tool outputs are unchanged. See payloads.md for semantic changes, source hashes and measurement limits; byte savings are not token/quality claims.

Verification: `npm run verify` passed formatting, lint, 219 tests in 54 files, TypeScript and production build. Focused context/mutation/fallback tests passed before the full suite. This checkpoint does not complete the broader hardening goal; proposal review, remaining benchmarks, restore lifecycle and release audit continue below the requirement ledger.

### Conversation-scoped proposal review

Desktop proposal reads now require a validated thread ID and filter pending rows in SQL before the 50-item bound. The active chat displays only its proposals; a missing chat displays none. Delayed list responses, approval failures from another chat, and refresh responses predating an approval/rejection cannot replace current review state or reinsert resolved proposals. Database coverage verifies a selected conversation remains retrievable behind more than 50 other pending proposals. Four UI regressions cover scope, error ownership, failed loading and resolve/refresh ordering.

The real desktop fixture now includes a synthetic provider-driven rejection/approval flow, asserting no note exists while approval is pending or after rejection and that approval creates one note with one history revision. No real provider is contacted. Full friendly diff presentation and structured final execution outcomes remain separate work; thread deletion/pending proposal lifecycle also needs explicit reconciliation in that pass.

Verification: targeted mutation/scope suite passed 11 tests; the added resolve/refresh ordering case brought the proposal UI suite to four passing tests. TypeScript and scoped ESLint passed. Real Electron proposal rejection/approval and all existing desktop scenarios passed in `/tmp/strata-proposal-review-desktop.log`; the final list-version guard was checked by the dedicated UI regression. The previous full-suite checkpoint is 219 tests; current inventory is 224.

### Readable proposal changes and project review context

Proposal review now presents a linear-time text replacement region with explicit additions/removals and omitted unchanged edges, plus a before/after table for changed note/project metadata. The complete original snapshots remain available in a disclosure. This is a contiguous replacement-region diff, not a minimum edit script; it avoids quadratic line matching for large notes. Tests cover exact boundaries, empty content/newlines, 50,000 shared lines, literal rendering of hostile HTML, metadata and retained snapshots.

Verified an additional review gap: project rename/delete proposals previously stored no before state, so reviewers could not identify the current project from the displayed snapshots. Proposal creation now records the current project or complete project order before the transactional dry run, as well as note snapshots for restore/delete operations. Tests prove project identities/order are visible and proposal creation leaves persisted projects unchanged. Project-level concurrency preconditions remain part of the remaining proposal lifecycle audit.

The permissions guide was materially stale: it described confirm as immediate application, human edits as unrecorded, and unconditional revert/unauthenticated API usage. It is now replaced by current approval/history/recovery behavior; the original is preserved with a historical warning. Provider/routing docs also needed correction for OS-encrypted credentials, fallback policy, advisory router metadata and exact eval fixture count (50). The earlier `.loop-engineering` success summary is explicitly scoped to its historical task, not this upgrade. Source audit found the exposed `ask_each_time` setting has no per-message chooser; this remains an implementation task, now recorded in the ledger rather than falsely documented as working.

Verification so far: `npm run verify` passed format/lint and all 227 tests in 56 files; TypeScript/build completion and updated desktop diff verification follow. An initial scoped lint check rejected exporting the diff helper alongside the component; the helper was moved into its own module and lint passed. No runtime failure was involved.

Read-only repository sweep: `rg` found no unresolved TODO/FIXME/HACK markers in first-party app/scripts; remaining matches describe TODO extraction/capture features. GitHub `gh issue list --repo robertdevore/strata --state open --limit 100 --json number,title,url,labels` succeeded and returned no open issues on 2026-09-08. Historical `.loop-engineering` records were inspected as prior-task evidence, not current completion authority.

Full `npm run verify` completed successfully (227 tests/56 files, format, lint, TypeScript, production build). The first updated desktop run stopped at a fixture locator: adding the complete-state disclosure created a second `summary` element. The fixture now targets the proposal heading explicitly; this was a selector ambiguity, not an application failure. The final desktop retry uses the same verified build.

Final desktop verification passed with the readable text diff and complete-state disclosure: rejection/approval, one saved revision, cancellation, persistence/conflicts, navigation, invalidation and security fixtures all passed. Log: `/tmp/strata-proposal-diff-desktop-final.log`.

### Explicit per-message model choice

Implemented the previously unwired Ask each time setting. A provider-qualified picker above the composer requires a new valid choice for every message and clears after send or conversation change. Keyboard and button submission obey the same guard. This mode hides the persistent thread picker and uses a neutral assistant label instead of falsely attributing a per-message reply to the stored thread model. Catalog refresh now follows all provider/model configuration inputs, not only the serialized custom catalog.

The IPC contract accepts an optional requestModel and rejects a missing per-message choice in ask_each_time before recording messages or starting providers, regardless of the thread's stored model. The runner separately fails closed without an explicit forced model. A selected request model overrides only that request, never the thread setting; forced-model behavior prevents automatic premium escalation.

Focused routing/cancellation/UI tests passed 15 cases. Tests cover Enter, repeated sends, chat changes, removed catalog choices, unchanged ordinary Auto behavior, no persisted message/provider work before selection, and unchanged thread model. An initial TypeScript check found an incorrect local settings variable in EditorPane; it was replaced with a scoped store subscription before desktop verification. The final desktop fixture now chooses a model separately for rejection and approval and checks the actual synthetic provider request model.

Per-message selection verification: final scoped TypeScript, ESLint and production build passed; the final picker UI tests passed after hiding the thread picker and guarding removed catalog choices. Current inventory is 230 tests, with the last complete suite checkpoint at 227. The first desktop attempt stopped at a duplicate Settings-button locator in split-pane layout; the fixture now explicitly selects the first global Settings control and retries against the same build.

The next desktop attempt reached Settings but its exact label locator did not match the nested AI Mode label. The fixture now scopes to the AI Mode label's select element. Both desktop interruptions so far occurred before exercising model selection and are not reported as successful end-to-end coverage.

Final desktop model-choice verification passed. Each request required a separate selection; the synthetic provider received the exact chosen model, and rejection/approval plus all prior desktop scenarios passed. Log: `/tmp/strata-ask-model-desktop-choice.log`.

### Deleted conversation lifecycle

Chat deletion now rejects its pending proposals atomically with message/thread removal, preserving already-saved notes. Main request ownership can bind newly created or existing threads and abort all requests associated with a deleted thread across renderer owners, while leaving other conversations/transcription requests unaffected. Slots remain occupied until cancelled work settles. The runner, mutation executor and proposal service each reject late work for a deleted owning thread; the IPC response path does not attempt a late assistant insertion after deletion.

The confirmation text now explains pending-proposal rejection and preservation of saved notes. Focused tests passed 27 cases across mutation safety, fallback, request ownership and IPC cancellation, including a provider response arriving after direct database thread deletion. TypeScript, scoped lint and production build passed. Current inventory is 234 tests; last full suite checkpoint is 227. The expanded desktop fixture creates another pending proposal, deletes its chat, confirms the proposal cannot be approved, and checks the previously approved note remains.

Desktop deletion verification passed, including refusal to approve the deleted chat's proposal and preservation of the already-approved note. All prior desktop scenarios also passed. Log: `/tmp/strata-deleted-chat-desktop.log`.

### Project proposal preconditions

Confirmed that project proposals previously checked no original state during approval. Rename/reorder proposals now fingerprint the reviewed project metadata/order. Deletion additionally streams affected note IDs/revisions (including archived/deleted members) without loading their Markdown bodies. The review shows the affected assignment count and explains that notes/history remain saved after project removal. The fingerprint is captured before dry-run and compared inside the approval transaction; changed state leaves the proposal pending and makes no mutation. Legacy project proposals lacking a fingerprint fail closed and can still be rejected.

Nineteen targeted proposal/mutation/UI tests passed, including stale rename, a new project after reorder review, changed note revisions/membership before project deletion, archived/deleted members, successful fresh approval, and legacy rejection. Current inventory is 237; final scoped type/lint/build results follow. No schema migration was needed because proposal metadata is already stored as JSON.

Scoped TypeScript, ESLint and production build passed for project preconditions. The previously passing desktop approval/deletion fixture is retained; a final full-suite/release run remains required by the goal.

### Structured mutation outcome reports

AI tool execution now returns internal mutation receipts containing operation, applied/unchanged/proposed/failed status, actual entity identities/revisions, proposal IDs and stable failure codes. The shared loop preserves these receipts across cheap/premium fallback and reports an explicit completion/context/tool-limit reason. The final mutation response is generated from those facts and persisted through the existing chat message path; provider success prose cannot hide partial failure or treat an unapproved proposal as an applied edit. Displayed entity links are capped at 20 per operation with an explicit remainder count, and titles are Markdown-escaped. Ordinary retrieval explanations remain available; the remaining language check is only defense in depth when no mutation ran.

Removed the renderer's text/UUID-based automatic note switching. Saved-note links provide explicit navigation and cannot steal focus after a background reply. No-op updates emit unchanged status and retain the current revision. The hard context guard now includes serialized tool definitions in addition to conversation and system content.

Found another concrete after-commit failure path: throwing notification callbacks could cause committed service/AI writes to be reported as errors and lose their outcome receipts. A shared notification wrapper now isolates delivery failures and emits only a fixed warning, with no caught exception/body/secret text. Main delivery skips missing/destroyed WebContents. Tests cover a committed create, approved proposal, and fallback write despite listener failure.

Targeted execution/mutation/loop tests passed 33 cases before the catalog-budget/notification additions. An initial lint error in the title-escaping expression was corrected. A verification run overlapped a wording edit and compared a cached formatter with a newer assertion; it completed as failed and is not counted as passing. The fresh full run starts after all code edits, with an expected 245-test/59-file inventory. No completion verdict is implied by this checkpoint.

The stable full verification passed 245 tests in 59 files, format, lint, TypeScript and production build. A follow-up isolated API reproduction then confirmed a remaining legacy restore path returned HTTP 500/INTERNAL_ERROR while `restoreCommitted` was true when its notification listener threw. Direct API restore/revert and IPC history/revert notifications now use the same guard. The new HTTP regression passed: response 200 contains the restored note/new revision and the stored state matches. Current inventory is 246; scoped final checks and desktop verification follow.

Proposal approval/rejection now emits explicit, conversation-scoped success feedback so a resolved card disappearing is not the only indication of success. Five proposal UI tests passed, including success feedback and thread-change clearing; scoped TypeScript, lint and build passed. Current inventory is 247. The final desktop fixture also checks both feedback messages.

Desktop execution verification passed the complete fixture, including explicit approval/rejection feedback, chat deletion, model choice, draft persistence and security checks (`/tmp/strata-execution-desktop.log`). A final UI guard preserves approval feedback when the same response finishes typing; the five-case proposal UI suite, TypeScript, lint and build passed after that guard. Full-suite checkpoint remains 245; current inventory is 247 including the API restore-notification and feedback regressions.

### Restore staging and installation failure safety

Restore imports now use SQLite online backup to capture committed WAL state into a canonical `strata.sqlite`, including when users select a `.db` filename. Staging checks recognizable note/settings columns, opens/migrates an isolated copy (rejecting future schema versions), exports through the credential-sanitizing backup path, and removes failed staging directories. Imported directories/files are private. Installation finishes copying the replacement and preserving the closed current bundle before modifying current files; a failed installation restores preserved originals and retains recovery copies. This corrects the prior sequential live-WAL copy, filename mismatch, failed-import leftovers, and preservation moves outside rollback protection.

Verification: five backup tests passed, including live WAL capture, arbitrary filenames, unrelated/future database rejection, automatic retention/history restore, and injected installation failure preserving latest saved content. TypeScript build and scoped ESLint passed. Full restore lifecycle work remains open: draft handshake, draining active writers/backups, cross-process exclusion, and safe recovery/relaunch after a closed database. This commit does not claim those lifecycle guarantees or power-loss durability.

### Require saved drafts before restore

The main process now runs restore through the existing UUID-bound draft-save handshake. Restore requires successful persistence, never offers discard as a substitute, serializes against other lifecycle requests, and re-enables editing on failure. Its safety backup is taken after the save acknowledgement and desktop API shutdown rather than during early import preparation. API startup is tracked so restore cannot race an unfinished startup; a safety-backup failure resumes the API and backup timer. Installation failure after closing the database reports the failure and restarts rather than leaving IPC handlers bound to a closed connection.

Verification: 13 scoped backup/lifecycle tests passed, including failed-save refusal without discard and restore/close serialization; TypeScript, scoped ESLint and production build passed. Real desktop restore, active IPC/AI/backup draining and cross-process exclusion are still required before the complete restore path can be considered verified.

### Drain desktop work before restore

Trusted IPC now supports temporary suspension and bounded draining of already-dispatched asynchronous handlers. Restore suspends new work after the successful draft acknowledgement, cancels all owned AI requests, waits for their handlers and other IPC to settle, drains manual/automatic backups through their final settings callback, then closes the desktop API and creates the safety backup. Timeout before database closure resumes IPC/API/backup scheduling. Backup restore handlers serialize import/installation attempts. The existing sender checks remain first and synchronous handlers retain their return behavior.

Verification: 17 scoped lifecycle/backup/IPC tests passed, including suspension timeout/resume and automatic-backup callback draining; TypeScript and scoped ESLint passed. Cross-process library exclusion and real desktop restore/restart validation remain open. A synthetic SQLite coordination-lock experiment confirmed shared owners prevent exclusive acquisition and exclusive mode prevents new readers; no coordination lock is implemented in this commit.

### Exclude other Strata owners during replacement and recovery

Every StrataDatabase now holds a shared SQLite lease on a private coordination file separate from the note database. A second short-lived SQLite gate serializes owner admission and restore upgrades, preventing a gap while converting the shared lease to exclusive access. Restore requires all other supported owners to close and retains exclusion through primary database closure/replacement. OS process teardown releases locks; no PID files or stale-lock cleanup are needed. Corruption preflight/recovery now holds the same lease, acquires exclusive access before quarantine, and returns to shared access after recovery. Coordination failures cannot be mistaken for note-database corruption. Direct external SQLite clients remain outside this supported protocol and must be closed, as documented in README.

Design reference: [SQLite transaction locking](https://www.sqlite.org/lang_transaction.html), especially rollback-journal EXCLUSIVE transactions excluding readers. An initial single-file locking-mode prototype retained a pending lock after a failed upgrade; the test exposed that availability issue, and the implemented admission gate avoids it. Regression tests cover ordinary concurrent writes, failed restore with continued/new owner access, exclusive denial of new owners, preflight exclusion, coordination corruption preserving the note database, and a synthetic child process exiting while holding a shared lease.

Verification: `npm run verify` passed formatting, ESLint, all **257 tests across 60 files**, TypeScript and the production build. Log: `/tmp/strata-restore-verify.log`. Real desktop restore/restart verification is next; release readiness remains unclaimed.
