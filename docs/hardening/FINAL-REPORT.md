# Strata hardening final report

Starting point: e2ca89b9b38efc71cb4c1652649b5297f5f67310, Strata0.8.0. Final core runtime evidence:7bb45dc; final legacy-boundary correction:fc407a3. This report closes the [60-step ledger](requirements.md). The [historical record](STATUS.md) preserves discoveries and intermediate failures rather than rewriting them as successes.

## Executive summary

Strata now has authenticated local automation, isolated Electron privileges, encrypted provider credentials, transactional revision history and conflict-safe writes. Indexed summaries replace full-library body hydration on normal retrieval paths. Humans retain recoverable drafts and reviewable AI proposals; agents receive bounded context and explicit mutation receipts. Markdown and local SQLite remain the source of truth. No cloud service, vector database or MCP framework was added.

## Security

All native API endpoints require a locally generated private credential or explicit strong token. Non-loopback binding and browser Origin/Sec-Fetch requests are refused; responses have no permissive CORS. Request, response, URL and connection limits are enforced. The final sweep found the old Paperclip bridge could bypass this boundary by forwarding browser writes with a configured credential: it and redundant unbounded legacy clients now fail closed, with migration guidance.

The renderer has sandboxing, context isolation, no Node, production CSP, default-deny permissions and trusted main-frame IPC validation. Arbitrary shell IPC is removed. HTML publishing uses a native-selected canonical directory and exclusive bounded writes; PDF/print documents cannot run JavaScript or fetch network content.

Provider keys use OS safeStorage, with presence-only settings in the renderer. Resumable migration removes old SQLite credentials; sanitized backups remove secrets, vacuum and verify integrity in a worker. Standalone access to unmigrated legacy secrets fails closed. Existing historical backups remain the owner's responsibility and are not silently rewritten.

Provider fetches have deadlines, abort propagation, response limits and no redirects. Canonical metadata/link-local/multicast addresses are rejected; plain HTTP is limited to pinned loopback. HTTPS LAN/custom providers remain supported with normal DNS/TLS; this is not a general DNS-pinning firewall. See [endpoint policy](../provider-endpoint-security.md). No known critical/high finding discovered during this work remains open.

## Performance

Matched synthetic libraries contain varied Markdown, tags, archived notes, dense links and a large project. Same hardware/dependencies/harness; full100/1k/10k/50k initial comparison and final10k/50k follow-ups retain hashes and samples. Representative50k medians, milliseconds:

| Operation | Original | Final |
|---|---:|---:|
| Search10 |354.36|4.77|
| List100 |715.77|1.01|
| Tag counts |801.41|6.00|
| Exact title |1,156.68|0.21|
| Dense backlinks |5,977.68|241.03|
| Related hub over HTTP |3,981.60|9.40|
| Related large project over HTTP |3,569.32|6.25|
| Edit with outgoing links |4,865.83|3.27|
| Rename dense hub |161,275.32|766.12|
| CLI list50, new process |3,925.60|595.30|
| CLI search10, new process |1,090.44|617.25|
| Sanitized backup |1,390.63|8,777.77|
| Delete large project |2,512.23|7,163.86|

The old list hydrates full bodies before slicing; current results are bounded summaries. Related ranking and backlink limits differ. Backup now sanitizes and verifies; deletion records every affected revision. These safety costs remain visible. Intermediate project deletion exceeded20seconds; one transactional INSERT SELECT reduced it to7.16seconds without relaxing the budget. Both final sizes pass every [enforced budget](performance-budgets.md). [Full results and methodology](controlled-final/README.md) include10k, startup, remaining operations and CLI bytes.

[Real Electron measurements](renderer-v1/README.md) cover all four sizes. Both versions already display50 initial rows. At50k, initial note-open median improved5,228.77→1,160.14ms, but a6.9-second input outlier is retained. Follow-up [CPU profiles](editor-profile/README.md) after stabilizing editor extensions observed input564.25→347.39ms, save acknowledgement976.84→842.99ms and preview218.64→84.71ms. Three interactions per run are observations, not p95 guarantees; timing includes automation/debounce/lazy initialization. No claim of eliminating every long-tail stall is made. Recent AI context and chat previews are now bounded in SQL before hydration.

## Token efficiency

UTF-8 bytes are measured, not inferred model tokens. [Payload artifacts](payloads.md) disclose count and semantic changes:

| Payload | Original bytes | Current bytes |
|---|---:|---:|
| list_notes |45,182|6,872|
| search_notes |18,827|6,872|
| project metadata |75,474|172|
| System prompt |1,659|462|
| Open-note context |38,343|3,570|
| Conversation history |142,092|24,678|
| Combined context/full tools |187,019|34,012|
| Combined context/read-only tools |187,019|31,442|

Default lists now return15 summaries; project metadata excludes its notes. Fetch full bodies explicitly. Full-note payload grows7,309→7,372bytes for revision/title metadata; full tool catalog grows4,925→5,302bytes for safer contracts. Read-only exposes all10 retrieval tools,2,732bytes. These savings do not establish equivalent recall or live model quality. CLI list50 is131,996→27,721bytes at50k; compact formatting also contributes.

## Agent and human workflows

Agents discover API/schema versions, limits and features, retrieve summaries, hydrate selected notes and write with the revision actually read. Conflicts are structured errors. Atomic batches support50 operations and rollback dry-runs. Seven-day idempotency receipts reject mismatched retries; capture deduplicates exact content within its project and preserves source/session provenance. The installed CLI works outside the checkout and keeps HTTP access separate from database ownership.

Humans search the full library from sidebar/Quick Open, filter complete projects and select uncached wiki targets. Project counts and latest-note actions use SQL rather than the first cached page. Duplicate titles require selection; missing targets can be created explicitly. Literal title links are not globally rewritten on rename; UUID links remain stable.

Autosave serializes writes, preserves original revisions and ignores stale reads/acknowledgements. Each split pane shows its own conflict and recovery controls. Closing tabs, reloading, quitting and restoring protect drafts. History supports revision-safe restore and manual, previewed retention. Committed external/API/AI changes invalidate affected notes, projects, tags, links and history without discarding drafts.

## AI behavior and evaluation

Read-only cannot mutate any domain. Confirm stores conversation-scoped proposals with readable diffs; human approval rechecks original note/project state. Deleted chats reject pending proposals and late writes. Auto-apply still obeys schemas and concurrency. Structured operation receipts produce deterministic success/partial-failure/proposal reports rather than trusting model prose.

Cheap and premium routes share one bounded tool loop and execution state:6turns,20calls per response,30total. Fallback preserves prior writes, tool results, proposals and remaining budgets. Provider-qualified model identities prevent ambiguous guesses; Auto and Ask each time have explicit behavior. Custom endpoints advertise tools/system/temperature capabilities. Context is bounded by whole entries, with omission counts and tool catalog accounting; recent history reads are bounded in SQLite.

The published offline routing fixture improved46/50→50/50 exact matches after operation-priority/word-boundary corrections. Final5,000 classification samples:median0.392ms,p950.696ms, slower than the smaller original heuristic. [Per-case evaluation](routing/README.md) records expected/actual outcomes and hashes. Synthetic tests cover provider fallback, malformed tools, cancellation, mixed writes, approval and capability conformance. Live provider cost/calls are zero; model tokens and answer quality are unmeasured. No paid/live evaluation was substituted with invented metrics.

## Database and architecture

Versioned migrations reach schema13, with future-schema rejection and legacy compatibility tests. SQLite owns foreign keys, FTS5, normalized title/tag indexes, deterministic link maintenance, transactions and universal note revisions. Migration13 indexes active project recency. Bulk project deletion inserts revision snapshots in SQL in the same transaction as membership changes.

KnowledgeService supplies shared validation, mutation policy, import, proposals, batches and receipts. HTTP/IPC/AI/CLI use these contracts; transport-specific delivery stays outside committed transactions. ChangedDomains replaces coarse notesChanged invalidation. Thin history/recovery operations retain database-enforced revision invariants.

Backups use consistent snapshots, private staging, manifests and integrity checks. Restore drains active work, saves drafts and a safety backup, validates/migrates an isolated copy and preserves rollback data. Supported Strata owners coordinate through cross-process library leases; direct SQLite tools must also be closed. No automatic history deletion or automatic app updater was introduced.

## Concrete bugs fixed

The [ledger](requirements.md) and [work record](STATUS.md) contain source/test evidence for each group:

- Unauthenticated local API, wildcard browser bridge, arbitrary shell preload, insufficient navigation/permission/IPC checks and export network execution.
- Plaintext provider credentials in SQLite/backups, interrupted cleanup, unsafe endpoint aliases/redirects, unbounded provider/audio/client input and error leakage.
- Silent stale writes/reverts, absent mutation history, partial batches/imports, broken dry-runs, duplicate retries/captures and project deletion without atomic history.
- Global title/link/body scans, tag hydration, backlink N+1, oversized related project pools, inconsistent search fallback pages and incomplete cached project counts.
- AI confirm writes before approval, project read-only bypass, lost fallback tool context, stale project proposals, deleted-chat late writes, ambiguous provider selection and false mixed-operation success reports.
- Context/catalog overbudgeting, whole-history hydration, unbounded chat preview projection, incidental routing words overriding explicit operations and repeated editor-extension construction.
- Autosave overlap, delayed-response draft loss, uncached navigation failures, split-pane hidden conflicts, premature tab/application close and unsafe restore during active writes.
- Missing post-commit refresh, project-only refresh gaps, stale backlink/history views, cached-only wiki completion and latest-note selection.
- Inconsistent raw backup copying, unsafe restore replacement/failure cleanup, concurrent library-owner replacement, package worker/native module resolution and obsolete CLI documentation.
- Runtime/development dependency advisories, missing cross-platform native CI, misleading legacy scripts and stale optional-auth/shell documentation.

## Verification

- `npm run verify`: passed334tests/68files, formatting, lint, TypeScript and production build afterfc407a3's changes. Baseline77tests/16files.
- `npm run desktop:verify`: passed isolated real Electron autosave, conflicts, close/reload, history, restore/safety recovery, search/project/wiki navigation, synthetic AI approval/cancel, sandbox/IPC/permissions and export isolation.
- `npm run package:verify`: installed tarball CLI/native server smoke; `npm run package:electron:verify`: bundled native SQLite/FTS and sanitizer worker smoke. Runtime7bb45dc [CI](https://github.com/robertdevore/strata/actions/runs/34297601224) passed Linux/macOS full checks, Windows/Linux native packages and macOS desktop. Windows forced termination is not reported as graceful shutdown.
- `npm audit --json`: zero vulnerabilities at the recorded final audit. `npm ls --all --json`: no dependency graph errors. [Dependency rationale](dependencies.md) distinguishes runtime and development exposure.
- `npm run benchmark:check -- docs/hardening/controlled-final/current-10000.json docs/hardening/controlled-final/current-50000.json`: both pass. This checks preserved runs, not a fresh benchmark.
- `npm run eval:routing`:50/50offline cases. Controlled and renderer commands, immutable samples and CPU profiles are linked above. No user library was used for testing.

## Deferred work and readiness

Signing/notarization and actual installer install/upgrade acceptance are release gates documented in [RELEASING.md](../RELEASING.md); this task does not claim a signed public release. Live model answer-quality/token/cost evaluation needs chosen providers and credentials and remains unmeasured. Optional MCP should wrap the stable shared contracts; embeddings, cloud synchronization and an auto-updater are deliberately absent. Benchmark results are hardware/workload-specific, not universal latency guarantees.

Strata is ready as a daily-driver local notes application, an agent memory/context store, an authenticated local API and a base for a future thin MCP adapter within these tested boundaries. Public distribution still requires the documented native signing and installer acceptance gates. No known unresolved critical/high security issue from this work blocks the local application.
