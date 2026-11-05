# Strata repository hardening — 2026-11-04

## Repository and boundary

- Repository: `robertdevore/strata`; branch: `main`.
- Starting SHA: `7fa22a0d625c8b300eb25920ddd5eb596c24bae4` (clean working tree).
- Verified implementation ending SHA: 81943d263d86e471d94e93a9750bceb3c6755eb9.
- Mode: fix; repository-wide implementation review using Kujo Hardening phases 0–18. This is a subsequent review, not a replacement for the historical `docs/hardening/` audit.
- Purpose: local-first Electron/React Markdown knowledge application, SQLite source of truth, optional AI and authenticated HTTP/CLI automation.
- Integrations: Electron sandbox/IPC and OS encryption, better-sqlite3/FTS, React/Zustand/CodeMirror, optional OpenAI-compatible providers, installed CLI; retired Paperclip/legacy entrypoints fail closed. No other repository was changed.
- Host: Node v26.12.1, macOS x64. All verification libraries and provider fixtures were synthetic. No live user library was used as a test fixture.

## Baseline

`npm run verify` passed: 69 files, 338 tests, formatting, lint, TypeScript and production build. `npm audit --json --fetch-retries=0 --fetch-timeout=20000` reported zero vulnerabilities. Baseline payload measurements and a title extraction microbenchmark were captured before the corresponding edits.

The new API regression was run against the original implementation before fixing it: both tests failed because a 413 response had already starred notes and advanced their revisions. This is an established baseline defect, not a new test failure. See `artifacts/2026-11-04/baseline-response-repro.log`.

All artifacts for this run are in [artifacts/2026-11-04](artifacts/2026-11-04/). Baseline logs are retained unchanged. Existing npm configuration emits an unknown `python` config warning; it does not fail these checks. Historical payload benchmark `beforeBytes` fields refer to `e2ca89b`, not this run's starting SHA; only the two current-output columns are compared below.

## Findings

All five admitted findings have high confidence from source and behavioral tests. Priority follows the skill's categories; P0 includes correctness/integrity, not only remotely exploitable security defects.

| ID | Priority | Area | Finding and evidence | Action | Status |
| --- | --- | --- | --- | --- | --- |
| H1 | P0 | API atomicity | `write()` enforced the 4 MiB response cap after mutation commit; six 750,000-character notes updated in a tiny batch request reproduced failure-after-save. Escaped content reproduced it for a single metadata update. | Validate the serialized result inside an outer SQLite transaction; buffer refresh domains until commit. | Fixed; batch, single update, historical restore, retry/receipt and notification regressions pass. |
| H2 | P0 | AI concurrency | Request IDs were unique but two requests could bind the same thread, append overlapping user messages and complete replies out of order. | Reject a second active turn for that conversation with `AI_BUSY`, including canceled work that has not settled. | Fixed; registry and IPC regressions verify no second message/provider call and slot release. |
| H3 | P1 | Runtime/resource waste | Title extraction split/trimmed/filtered every line even when the first line was the title; note updates derived the same next title repeatedly. | Scan lines until the first heading; retain only the fallback line; compute the next title once per update. | Fixed; equivalence cases and measured fixtures pass. |
| H4 | P1 | AI retrieval contract | `list_projects` claimed all projects but silently sliced to 100 after loading every project. | Add bounded SQL pagination and `nextOffset`, retain the default first 100 and existing `projects` property. | Fixed; 105-project traversal and invalid offset coverage pass. |
| H5 | P2 | Chat search | Raw SQL LIKE patterns made `%` and `_` match unrelated messages. Note search already escaped these characters. | Reuse the existing LIKE escaping helper and explicit escape clause. | Fixed; percent, underscore, backslash and ordinary case-insensitive searches pass. |

## Changes implemented and compatibility

### H1: response failure means no mutation

`app/main/api/notesApiServer.ts` now wraps each mutation's complete response construction in a synchronous database transaction. Shared service transactions nest as savepoints. Serialization/size validation runs before the outer commit, so an oversized result rolls back notes, history, indexes and idempotency receipts together. The request-local service accumulates changed domains; only a successful outer commit publishes them. Restore/revert endpoints use the same boundary. Read responses retain their existing cap.

`apiMutationResponse.test.ts` covers large batch and escaped single-note responses, a historical restore, untouched revisions, no notification on rejection, and reusing a rejected idempotency key for a smaller batch followed by a silent replay. Existing API/security/service tests retain success, validation and authorization coverage. `API.md` documents the corrected contract.

The API's successful JSON shapes and 413 error code remain compatible. A previously misleading failed write now really fails without applying changes. No truncation or hidden partial success was introduced. This does not guarantee delivery if a client disconnects after a successful commit; ordinary transport ambiguity still requires the existing idempotency/revision contracts. JSON validation adds a serialization pass for mutation results; no throughput improvement is claimed for this fix.

### H2: conversation ownership

`app/main/ai/activeRequests.ts` permits one active request per thread, across renderer owners. Independent threads retain the global four-request allowance. `aiCancellationIpc.test.ts` proves the second turn is rejected before user-message persistence/provider dispatch and that subsequent turns work after settlement. `activeAiRequests.test.ts` proves cancellation alone does not free a slot. The existing request owner, cancellation and renderer-destruction protections remain in place. `docs/ai-edit-permissions.md` documents `AI_BUSY`.

### H3: title work

`app/shared/noteTitle.ts` scans newline boundaries without allocating a whole array of lines. It preserves first-heading-anywhere behavior, heading levels 1–6, trimmed whitespace, unlimited heading length, the first nonempty line's 80-character fallback, and `Untitled`. `app/main/db/index.ts` reuses a single next-title calculation within each actual update. Tests include CRLF, whitespace-only heading syntax, hashtags, long lines and large early/late-heading bodies. `scripts/benchmark-titles.mjs` compares the immutable starting implementation and current code using identical fixtures and checks output equality before measurement.

### H4–H5: complete bounded discovery

`listProjects()` supports an optional SQL limit/offset; unchanged callers still receive all projects. The AI tool requests one extra row to determine whether a next page exists, returns at most 100 projects, and validates offsets/limits. Ordering adds ID as a final tie-breaker. Existing no-argument tool callers retain their first page; `nextOffset` is additive. The tool schema and output changed intentionally and are documented. Offset traversal is not a snapshot: concurrent reordering/insertion can shift pages.

Chat keyword search now treats SQL wildcard punctuation literally, consistent with note search. This intentionally changes accidental wildcard behavior; no documented wildcard query language existed. Content snippets and result limits are unchanged.

There are **no database migrations, file-format changes, configuration/environment changes, dependency changes, CLI flag/exit-code changes, or required downstream migrations**. Public HTTP success shapes are unchanged. Model-facing project pagination is additive; a caller seeking more than 100 projects must follow `nextOffset`.

## Performance and efficiency

Title fixture: approximately 752,000 characters, 16,000 ordinary lines; 10 warmups, seven samples of 100 calls each per implementation. Table values are median milliseconds per extraction from `after-titles.json`, which loads both versions in the same process. Raw ranges and all samples are retained. This measures extraction only, not end-to-end saves, CPU utilization, peak RSS or model tokens.

| Fixture | Starting implementation ms | New implementation ms |
| --- | ---: | ---: |
| Heading first | 1.767105 | 0.000461 |
| Heading last | 2.377735 | 1.178299 |
| No heading | 2.432604 | 1.257254 |

The initial unchanged-code run (`baseline-titles.json`) had higher medians and showed substantial host variation. Do not compare separate runs as a controlled host experiment. Same-process figures support faster extraction on these fixtures, especially early headings; the sub-microsecond value is a microbenchmark, not an application latency promise. No timing assertion was added to CI. Line-by-line scanning removes whole-body arrays by construction; allocation/RSS savings were not separately measured.

Payload fixture uses the existing deterministic benchmark (100 notes, 12 open notes and 40 history messages). Values below compare this run's baseline/current results, not the benchmark's historical comparison:

| UTF-8 bytes | Starting SHA | New implementation |
| --- | ---: | ---: |
| Full tool catalog | 5,302 | 5,416 |
| Read-only catalog | 2,732 | 2,846 |
| Open-note context | 3,570 | 3,570 |
| History context | 24,678 | 24,678 |
| Combined context/catalog | 34,012 | 34,126 |
| Read-only combined | 31,442 | 31,556 |

The 114-byte catalog increase buys explicit project pagination and is intentional. There is no claimed token saving in this pass. These are bytes, not provider-specific token counts. Summary-first retrieval, scoped tool registration, bounded history and fallback replay state were already implemented and preserved. Dependencies and installed versions were not changed. Production builds pass; build speed/binary size and end-to-end latency were not controlled comparative measurements.

The final database benchmark also completed at 100, 1,000, 10,000 and 50,000 synthetic notes. At 50,000 notes it recorded median list/search times of 0.589/3.763 ms and process RSS of 118,743,040 bytes. This is a final-state smoke measurement, not a before/after claim or peak-memory measurement; fixture construction, host load and UUIDs are not controlled across runs. See `after-database-benchmark.log`.

## Phase coverage

| Phase | Implementation evidence and outcome |
| --- | --- |
| 0 — Ground truth | Read `AGENTS.md`, package/build/CI/release configuration, API/CLI contracts, DB/service/IPC/renderer/provider implementations and tests. Repository/branch/baseline above. |
| 1 — Baseline | Source verify, dependency audit, payload fixture and title microbenchmark; baseline failure reproduced separately. |
| 2 — Complexity | Reviewed shared mutation/service boundaries, DB title calculations, CLI adapters and renderer state. Removed repeated title work. Preserved large cohesive modules instead of speculative restructuring. |
| 3 — Runtime | Reviewed indexed note search, tags, link maintenance and title path. H3 measured; H4 avoids fetching all project rows to return one page. No broad latency claim. |
| 4 — Resources | Inspected API 1 MiB bodies/4 MiB replies, streamed provider/client caps and deadlines, active request slots, bounded history and renderer cache pruning. H1 fixes failure at a resource boundary; H3 removes eager line arrays. |
| 5 — Agent context | Inspected `aiRunner`, `toolLoop`, tools, open-note snippets, recent history and CLI agent context. Read-only schemas omit writes; bounded tool steps/calls and retained fallback state limit replay. H4 corrects silent loss of discovery. Payload delta measured above. |
| 6 — Output | Reviewed compact CLI envelopes, opt-in diagnostic logs, structured transport errors and summary/body split. Kept detailed verification in artifacts and concise receipts. No evidence justified reducing necessary error/context data. |
| 7 — Failure semantics | H1 reproducer and rollback tests; inspected service dry-runs/receipts, provider fallback, backup/recovery worker deadlines and GET-only client retries. No mutation retry amplification added. |
| 8 — Security | Reviewed trusted IPC, sandbox/navigation/permissions, authenticated loopback/origin rejection, provider endpoint constraints, secret store/migration, export destinations and input bounds. See security section. |
| 9 — State/concurrency | H2 plus H1 after-commit notifications. Inspected library admission/exclusive leases, optimistic note revisions, renderer draft generations and serialized refreshes, proposal approval fingerprints and deleted-thread cancellation. |
| 10 — Contracts | H4 schema/output addition and H5 literal search correction documented. API successful envelopes, revision conflicts and CLI serialization retained. |
| 11 — Dependencies | Lockfile/build inputs/packaging/CI reviewed; audit zero before/after. Earlier Dependabot remediation predates this run. No unproven dependency removal or replacement. |
| 12 — Tests | Added behavioral failures for API rollback, overlapping IPC chat turns, literal search, title equivalence and catalog traversal. Full suite and installed/native/desktop checks below. |
| 13 — Ratchets | New behavioral tests run in existing verify CI. Existing fixed context/output and performance-budget checks retained. No host-dependent title timing gate. Intentional future tool growth requires reviewing the payload fixture/budgets rather than suppressing failures. |
| 14 — Documentation | Updated API response semantics, AI concurrency/retrieval contract and AGENTS audit pointer. Retained historical reports as history. |
| 15 — AI developer experience | AGENTS maps architecture/commands/invariants; CLI has machine-readable envelopes and explicit body reads; schemas validate model input. New report provides exact reproducible evidence without another instruction framework. |
| 16 — Dead weight | Checked package scripts/bin/files and legacy CLI/Paperclip references. Retired scripts explicitly exit with `LEGACY_INTERFACE_RETIRED`; retained their migration diagnostics. Release scripts and worker entrypoints are active and preserved. No deletion solely because a file appeared old. |
| 17 — Implementation | Five supported fixes, focused regressions, affected documentation; no cosmetic refactor campaign. |
| 18 — Final verification | Commands/statuses below; baseline retained and limitations explicit. |

## Security

The API bug was an integrity/failure-semantics flaw reachable by an authenticated local client; it is not evidence of an authentication bypass. Tests use synthetic bearer tokens. Conversation overlap was a state-ordering risk at the trusted IPC boundary. No new external attack-surface claim is made.

Reviewed controls include `trustedIpc` sender/frame/document validation; sandboxed renderer and default-deny permission handlers; denied new-window/arbitrary scheme navigation; HTTP loopback binding and timing-safe credential comparison; request/header/body/URL caps; provider URL validation, redirect rejection and streamed deadlines; model permission/proposal validation; canonical publish directories and exclusive output creation. `EncryptedSecretStore` fails closed without OS encryption, uses private encrypted files and atomic rename; credential migration verifies storage and scrubs SQLite/WAL before marking sanitization complete. Versioned migrations are transactional and reject newer schemas. Backup/recovery code verifies isolated copies and coordinates library ownership.

Existing security regression suites and `npm audit` pass. This is a code-supported hardening review, not a claim of exhaustive penetration testing, live-provider certification or OS-keyring validation on all operating systems.

## Remaining work and exclusions

- **P0/P1/P2/P3:** no admitted finding remains unresolved in this pass; no known introduced regression.
- **Needs more evidence:** very large full-conversation desktop rendering and the maximum 100-note CLI full-body hydration path may merit workload-specific profiling. They are existing explicit full-detail behavior; this run did not reproduce a resource failure, so no speculative paging/concurrency rewrite was introduced.
- **Not worth changing:** retirement diagnostic stubs, broad DB/renderer module splits and cosmetic cleanup without a behavioral benefit.
- **Verification limits:** Linux/Windows and ARM64 runtime checks were not executed on this macOS x64 host; live provider services, signing/notarization and installer acceptance were not tested. Existing CI/release instructions cover those environments. This hardening pass does not rebuild or supersede the earlier UI-fix DMG; that installer remains at `7fa22a0`.
- **Cross-repository follow-ups:** none required. No dependent Kujo repository needs a change for these fixes.
- **SignalBox:** no captures warranted; fixed findings and routine evidence belong in this report/Strata, not an unresolved-action queue.

## Implementation commits

- `cb8ffa8`: reject oversized mutation responses before commit.
- `d6e486f`: scan titles lazily and reuse update calculations.
- `9f7935a`: serialize active turns within each conversation.
- `81943d2`: paginate project discovery and search chat text literally.

## Verification receipt

Commands ran from the repository root. Full logs are retained in the dated artifact directory.

| Command | Status / artifact |
| --- | --- |
| `npm run verify` before edits | PASS, 69 files / 338 tests; `baseline-verify.log` |
| `npm audit --json --fetch-retries=0 --fetch-timeout=20000` before/after | PASS, zero vulnerabilities; `baseline-audit.json`, `after-audit.json` |
| `npx vitest run app/renderer/src/tests/apiMutationResponse.test.ts` before API fix | EXPECTED FAIL, both original cases demonstrate committed writes after 413; `baseline-response-repro.log` |
| `npx vitest run app/renderer/src/tests/apiMutationResponse.test.ts app/renderer/src/tests/notesApiServer.test.ts app/renderer/src/tests/apiSecurity.test.ts` | PASS, 9 tests; `response-fix-tests.log` |
| `npx vitest run app/renderer/src/tests/apiMutationResponse.test.ts` after restore case added | PASS, 3 tests; `restore-tests.log` |
| `node scripts/benchmark-titles.mjs` before/after title edits | PASS, equality assertions and raw timings; `baseline-titles.json`, `after-titles.json` |
| `npm run benchmark:payloads` before/after | PASS; `baseline-payloads.log`, `after-payloads.log` |
| `npm run verify` after all changes | PASS, 70 files / 353 tests, format/lint/types/build; `final-verify.log` |
| `npm run package:verify` | PASS, installed CLI/native DB/auth/capture/retrieval/shutdown; `after-package.log` |
| `npm run package:electron:verify` | PASS, packaged Electron native SQLite and worker; `after-electron.log` |
| `npm run desktop:verify` | PASS, isolated Electron interactions and security boundaries; `after-desktop.log` |
| `npm run benchmark` | PASS, all default sizes through 50,000 notes; `after-database-benchmark.log` |
| `git diff --check 7fa22a0 HEAD -- . ':!docs/audits/artifacts/**'` | PASS; archived raw Vitest logs retain their original trailing blank lines and produce three whitespace notices when included. |

The report commit follows the verified implementation SHA above; it cannot include its own SHA. Strata consolidation records the final pushed report commit and the session handoff.
