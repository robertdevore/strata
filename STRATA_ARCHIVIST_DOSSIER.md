# Strata Archivist Dossier

Generated from local sources in `/Users/robertdevore/2026/strata` using the Archivist package at `/Users/robertdevore/2026/Kujolang/kujo-repos/kujo-agents/archivist`.

## Executive Summary

- Confirmed: Strata is a local-first Markdown notes app built with Electron, React, TypeScript, and SQLite, with optional AI, keyboard-first workflows, a local HTTP API, and a CLI for automation and agent workflows. Sources: [S1], [S2], [S3], [S4].
- Confirmed: The repository is organized around Electron main/preload/renderer/shared layers, SQLite persistence, IPC handlers, a local notes API server, CLI command modules, publish integrations, local skills, docs, scripts, and Vitest tests. Sources: [S1], [S5], [S6], [S7], [S8], [S9], [S10].
- Confirmed: Local verification on 2026-07-04 passed `npm run test -- --reporter=dot` with 12 test files and 51 tests. Source: [S35].
- Planned: Local llama.cpp support, inline diff preview/confirm approval flow, several publish providers, independent security review, CI policy enforcement, release sign-off, and SLA/support documentation are identified as future or incomplete. Sources: [S11], [S12], [S13], [S14].
- Unknown: No inspected source establishes external usage metrics, current release artifact availability, independent audit completion, or production deployment history. Sources: [S14], [S36].

Evidence status: mixed; individual claims are labeled below.

## One-Sentence Description

Confirmed: Strata is a local-first Markdown notes app with optional AI, keyboard-first workflows, and a scriptable local HTTP API/CLI surface for human and agent automation. Sources: [S1], [S2], [S3].

Evidence status: confirmed.

## What Strata Is

- Confirmed: Strata is described by its README as a "Local-first Markdown notes app with optional AI, keyboard-first workflows, and a scriptable local API." Source: [S1].
- Confirmed: Package metadata names the project `strata`, marks it private, sets version `0.6.0`, uses MIT licensing, and describes it as a local-first minimalist Markdown notes app. Source: [S4].
- Confirmed: The app uses Electron main process code, a preload bridge exposed as `window.strata`, and a React renderer. Sources: [S1], [S5], [S8], [S15].
- Confirmed: Data is stored locally in SQLite under Electron `userData`, with WAL mode and migrations for notes, settings, AI chat, wiki links, AI edit history, route logs, projects, and project ordering. Sources: [S6], [S16].
- Confirmed: The local HTTP API listens on `127.0.0.1:3939` by default and exposes note, tag, project, search, backlink, related-note, and AI edit history/revert endpoints while Strata is running. Sources: [S3], [S7].
- Confirmed: The CLI is an HTTP API client and is explicitly described as avoiding direct SQLite writes. Sources: [S2], [S9], [S17], [S34].
- Unknown: Strata is not established by inspected sources as a KUJO language runtime, interpreter, or programming language repository. Source: [S36].

## Why Strata Exists

- Confirmed: The README states motivations around local-by-default notes, fast writing/navigation, optional AI assistance with explicit edit controls and revert history, local API/CLI automation, and hardened desktop architecture. Source: [S1].
- Inferred: The sources suggest Strata is designed both for personal knowledge management and agent-assisted memory workflows, because the README/API/CLI describe notes, API automation, agent commands, and repo-local skills for Strata context/memory. Sources: [S1], [S2], [S3], [S18], [S19], [S20].
- Unknown: The inspected sources do not establish a formal product strategy, business model, or adoption target beyond the documented app and workflow goals. Source: [S36].

## Core Product And Data Concepts

- Confirmed: Notes contain Markdown `content`, timestamps, starred/archived state, tags, optional project assignment, and soft-delete state. Sources: [S3], [S6], [S16].
- Confirmed: Projects are local note groupings with names and sort order; APIs and CLI commands support list/create/rename/delete/reorder/import operations. Sources: [S2], [S3], [S16], [S21].
- Confirmed: Tags are stored on notes as arrays and exposed through tag listing, normalization, and deterministic suggestion utilities. Sources: [S2], [S6], [S22], [S23].
- Confirmed: Wiki links are parsed from `[[Target]]` syntax, stored in `note_links`, and used for backlinks and related-note workflows. Sources: [S16], [S24], [S25].
- Confirmed: Related notes are ranked using links, backlinks, shared tags, and similar text; tests cover ranking, deletion exclusion, and result limits. Sources: [S7], [S25].
- Confirmed: AI chat threads/messages, route logs, edit history, and per-thread model tracking are represented in migrations and IPC/API surfaces. Sources: [S16], [S26], [S27].
- Planned: Inline diff preview and a confirm-mode approval flow are documented as deferred. Source: [S12].
- Unknown: The inspected sources do not establish sync, collaboration, mobile clients, or cloud-hosted note storage. Sources: [S1], [S36].

## Architecture

- Confirmed: `app/main` contains Electron main process code, IPC handlers, DB, backup management, AI providers/routing, and the notes API server. Sources: [S1], [S5], [S6], [S7], [S26].
- Confirmed: `app/preload` exposes a typed `window.strata` bridge with notes, tags, projects, settings, exports, backups, AI, links, publish, shell, and event-listener APIs. Sources: [S8], [S15].
- Confirmed: `app/renderer` contains the React UI, Zustand state, domain utilities, services, components, screens, styles, and tests. Sources: [S1], [S28], [S29].
- Confirmed: `app/shared` contains cross-process contracts such as IPC channels, types, hotkeys, home tiles, and sidebar layout. Sources: [S1], [S30].
- Confirmed: Browser windows are configured with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`; the README also documents these hardening choices. Sources: [S1], [S5].
- Confirmed: The main process starts `BackupManager`, registers IPC handlers, and starts the local notes API server after `app.whenReady()`. Source: [S5].
- Confirmed: The local HTTP API validates request payloads with Zod, enforces a 1 MB request body limit, supports optional token auth via `STRATA_API_TOKEN`, and returns JSON responses. Source: [S7].
- Confirmed: Publish providers are represented by a `PublishProvider` interface, with a built-in local HTML provider and dummy provider. Sources: [S13], [S31], [S32].

## Tooling Ecosystem

- Confirmed: npm scripts include dev, build, dist, test, lint, format, backup, local API helper, and Strata CLI entrypoints. Source: [S4].
- Confirmed: The primary CLI command namespaces are `health`, `config`, `notes`, `search`, `projects`, `tags`, `tasks`, `ai`, and `agent`. Sources: [S2], [S9], [S34].
- Confirmed: CLI global flags include base URL, token, JSON/pretty/quiet/verbose output, dry-run, confirm, timeout, agent mode, no-color, and fail-on-warning. Sources: [S2], [S9], [S34].
- Confirmed: CLI runtime config reads environment variables including `STRATA_API_BASE_URL`, `STRATA_API_TOKEN`, `STRATA_CLI_OUTPUT`, `STRATA_CLI_DRY_RUN`, and `STRATA_CLI_AGENT_MODE`. Sources: [S2], [S17], [S33].
- Confirmed: CLI safety tests cover confirmation requirements and extra destructive-operation protection in agent mode. Source: [S33].
- Confirmed: `scripts/notes-api.sh`, `scripts/strata-cli.ts`, `scripts/strata-ai.mjs`, `scripts/backup-notes.sh`, `scripts/migrate-drafts-to-strata.py`, and `scripts/strata-note.sh` exist as helper scripts. Source: [S37].
- Unknown: The inspected sources do not prove release artifacts currently exist in `release/`; README documents release/package commands and target formats. Sources: [S1], [S4].

## Workflow Ecosystem

- Confirmed: Human note workflows include Markdown editing, rich-text paste to Markdown, preview/edit panes, tags, starring, archiving, undo delete, search/filtering, projects, command palette, related notes, backlinks, pinned tags, and shortcuts. Source: [S1].
- Confirmed: API agent workflows include create-and-store-ID, upsert by query, archive/star toggles, search, backlinks, related notes, AI edits, and revert. Source: [S3].
- Confirmed: CLI agent workflows include capture, decision, todo, summary, and context search commands, with project targeting support. Sources: [S2], [S19].
- Confirmed: AI workflows include in-app chat, provider/model routing controls, read-only/confirm/auto-apply edit safety modes, edit history, and revert endpoints. Sources: [S1], [S11], [S12], [S26].
- Confirmed: Publish workflow supports local HTML export through a provider interface and documents SSG post-publish shell execution via preload IPC. Sources: [S13], [S31], [S32].
- Confirmed: Backup workflow is represented by `BackupManager` and the `backup:notes` script. Sources: [S4], [S38].
- Planned: Enterprise-readiness checklist marks independent security review, PR-level CI policy enforcement, release sign-off template, and SLA/support policy as incomplete. Source: [S14].

## Skills And Agents

- Confirmed: `skills/strata-context/SKILL.md` defines a read-side Strata context skill for searching prior notes and producing compact context packets. Source: [S18].
- Confirmed: `skills/strata-start/SKILL.md` appears to duplicate the Strata Context Skill content in the inspected first section, including read-side workflow and references to a save skill. Source: [S20].
- Confirmed: `skills/strata-memory/SKILL.md` defines a memory lifecycle policy for Strata across recall, encode, connect, consolidate, retrieve, validate, revise, and forget workflows. Source: [S19].
- Confirmed: The Strata memory skill specifies `Agent Notes` as the storage project for agent-created memories, while semantic scope should remain in note body/tags/metadata. Source: [S19].
- Inferred: The repo-local skills are intended to make Strata usable as durable agent memory infrastructure, but a skill alone is evidence of expected workflow, not proof that every memory practice is enforced by application code. Sources: [S18], [S19], [S20].
- Unknown: The inspected sources do not establish which global skill symlinks are currently installed on this machine. Sources: [S18], [S20].

## Repository Map

- Confirmed: `/Users/robertdevore/2026/strata` is the inspected repository root. Source: [S37].
- Confirmed: High-signal docs inspected include `README.md`, `CLI.md`, `API.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and files under `docs/`. Sources: [S1], [S2], [S3], [S10], [S11], [S12], [S13], [S14].
- Confirmed: Main app code is under `app/main`, `app/preload`, `app/renderer`, `app/shared`, and `app/cli`. Sources: [S1], [S5], [S6], [S8], [S9], [S28], [S30].
- Confirmed: Publish integrations are under `integrations/publish`. Sources: [S31], [S32].
- Confirmed: Skills are under `skills/strata-context`, `skills/strata-start`, and `skills/strata-memory`. Sources: [S18], [S19], [S20].
- Confirmed: Tests are under `app/renderer/src/tests` and include domain tests plus CLI tests. Sources: [S25], [S29], [S33], [S35].
- Unknown: No `.github/workflows` files were observed in the initial inspected file inventory. Source: [S37].

## Public Positioning

- Confirmed: The README positions Strata as "Local-first Markdown notes app with optional AI, keyboard-first workflows, and a scriptable local API." Source: [S1].
- Confirmed: The root CLI guide positions the CLI as "the automation-first interface for Strata" and says it is designed for both human and agent workflows. Source: [S2].
- Confirmed: The package description says "Strata - local-first minimalist markdown notes app." Source: [S4].
- Confirmed: The CLI program description says "Enterprise-grade Strata CLI (HTTP API only, no direct SQLite writes)." Source: [S9].
- Planned/Unknown: "Enterprise readiness" is a checklist context, not proof of completed enterprise certification or production readiness; several enterprise items remain unchecked. Source: [S14].

## Audience / ICP

- Confirmed: Explicit user-facing workflows cover local note users, keyboard-first users, users who want optional AI assistance, and users/tools/agents that automate through local API/CLI. Sources: [S1], [S2], [S3].
- Inferred: Developers and technical agents are likely target users for the CLI/API/skills surfaces because docs call out agent workflows, stable machine-readable errors, agent mode, and local memory skills. Sources: [S2], [S3], [S18], [S19].
- Unknown: The inspected sources do not define a formal ICP, buyer persona, pricing model, or commercial sales audience. Source: [S36].

## Examples

- Confirmed: README examples show `npm run build`, `npm run dist`, `npm run test`, `npm run strata -- health`, note listing/creation, project import, and `curl /health`. Source: [S1].
- Confirmed: CLI examples cover notes, projects, search, tags, tasks, AI routing/note/bench/eval, and agent capture/decision/todo/summary/context search. Source: [S2].
- Confirmed: API examples cover health, notes CRUD, project operations, search, backlinks, related notes, AI edit history, and revert. Source: [S3].
- Confirmed: Publish docs include example custom provider code and SSG command examples. Source: [S13].
- Unknown: No separate `examples/` directory was observed in the inspected file inventory. Source: [S37].

## Tests And Validation

- Confirmed: The repository uses Vitest, with `npm run test` defined as `vitest run`. Source: [S4].
- Confirmed: Tests cover renderer/domain behavior such as filtering, Markdown paste, note title/tag helpers, wiki link parsing, and related notes. Sources: [S25], [S29].
- Confirmed: CLI tests cover API client behavior, config resolution, validators, Markdown helpers, structured errors, agent safety gates, and the no-direct-SQLite-access architecture guard. Source: [S33].
- Confirmed: Local test run passed: 12 test files, 51 tests. Source: [S35].
- Unknown: The inspected sources do not establish whether CI runs these tests on every PR; the enterprise checklist marks CI policy enforcement as incomplete. Source: [S14].

## What Is Confirmed

- Confirmed: Strata is local-first and stores notes/settings in local SQLite. Sources: [S1], [S3], [S6].
- Confirmed: Strata has Electron hardening settings: context isolation, sandbox, and no renderer Node integration. Sources: [S1], [S5].
- Confirmed: Strata exposes a local HTTP notes API on `127.0.0.1:3939` by default. Sources: [S3], [S7].
- Confirmed: The CLI uses the HTTP API and does not import SQLite in its API client. Sources: [S2], [S9], [S33], [S34].
- Confirmed: Optional AI supports provider abstraction, routing, edit modes, edit history, and revert behavior. Sources: [S11], [S12], [S16], [S26].
- Confirmed: Publish support currently includes local HTML export through a provider interface. Sources: [S13], [S31], [S32].
- Confirmed: Tests pass locally as of this run. Source: [S35].

## What Is Inferred

- Inferred: Strata is intended to serve as both a human notes app and an agent memory substrate. Evidence: README/API/CLI describe notes, local automation, and agent workflows; repo-local skills formalize Strata context and memory practices. Sources: [S1], [S2], [S3], [S18], [S19].
- Inferred: The architecture prioritizes local safety boundaries because the app combines local API automation, privileged preload IPC, optional shell execution for publish workflows, and Electron sandbox/context isolation. Sources: [S1], [S5], [S7], [S13], [S15].
- Inferred: CLI/API contracts are treated as stable automation surfaces because docs, validators, error-shape tests, and architecture tests cover them. Sources: [S2], [S3], [S17], [S33].

## What Is Planned

- Planned: Local llama.cpp provider preset is disabled and identified as future. Source: [S11].
- Planned: Inline diff preview and confirm-mode approval flow are deferred. Source: [S12].
- Planned: Future publish provider ideas include GitLab Pages, GitHub Gist, Typefully, Markdown export, and static site folder workflows. Source: [S13].
- Planned: Independent security review, PR CI enforcement, release sign-off template, and SLA/support policy are enterprise-readiness next steps. Source: [S14].

## What Is Unknown

- Unknown: External user adoption, production deployment history, and current release download availability were not verified. Source: [S36].
- Unknown: Whether `.github/workflows` CI exists elsewhere outside the inspected inventory is not established; none appeared in the initial source listing. Source: [S37].
- Unknown: The exact runtime state of the local desktop app/API was not verified; CLI help and tests were run, but no Strata app instance was started for live API endpoint probing. Source: [S35].
- Unknown: Current global installation/symlink state for Strata skills was not verified. Sources: [S18], [S20].
- Unknown: No inspected source establishes Strata as a KUJO language/runtime implementation. Source: [S36].

## What To Avoid Saying

- Do not say Strata has cloud sync, multi-user collaboration, or mobile clients; inspected sources do not support those claims. Sources: [S1], [S36].
- Do not say Strata has completed independent security review or every-PR CI enforcement; the checklist marks these incomplete. Source: [S14].
- Do not say local llama.cpp support is implemented; docs mark it future/disabled. Source: [S11].
- Do not say all future publish providers are shipped; docs list them as future ideas. Source: [S13].
- Do not say CLI writes directly to SQLite; docs and tests support the opposite. Sources: [S2], [S9], [S33].
- Do not say AI edits are silent; docs state AI-created/updated notes are tracked and revertable. Source: [S12].
- Do not make broad KUJO language claims from this Strata repo; inspected sources do not establish that scope. Source: [S36].

## Glossary

- Confirmed: Strata — local-first Markdown notes app with optional AI, local API, and CLI automation. Sources: [S1], [S2], [S3].
- Confirmed: Note — Markdown content record with timestamps, tags, starred/archived state, optional project ID, and soft-delete state. Sources: [S3], [S6], [S16].
- Confirmed: Project — local category/grouping for notes, with sortable sidebar order. Sources: [S1], [S3], [S16], [S21].
- Confirmed: Tag — normalized note label used for filtering/listing/suggestion workflows. Sources: [S1], [S22], [S23].
- Confirmed: Wiki link — `[[Target]]` style link parsed from note text and used for backlinks/related notes. Sources: [S16], [S24].
- Confirmed: Related notes — notes ranked by link direction, backlinks, shared tags, and text similarity. Sources: [S7], [S25].
- Confirmed: AI route log — persisted record of routing decisions including intent, route, provider/model, risk, confidence, fallback, token fields, and timestamp. Sources: [S11], [S16].
- Confirmed: AI edit history — persisted audit/revert record for AI-created or AI-updated notes. Sources: [S12], [S16].
- Confirmed: Publish provider — interface for exporting a note, optionally with a post-publish hook. Sources: [S13], [S31].
- Confirmed: Agent Notes — storage project specified by Strata memory workflows for agent-created memories. Source: [S19].

## Source Notes

- [S1] Path: `README.md`  
  Type: README.  
  Detail: project description, Why Strata, core features, CLI/API, security/data model, project structure, scripts.  
  Supports: purpose, architecture overview, feature set, local-first/security claims.  
  Evidence status: confirmed.

- [S2] Path: `CLI.md`  
  Type: docs.  
  Detail: quick start, global flags, environment variables, exit codes, command reference, agent mode.  
  Supports: CLI command surface, API-only automation positioning, safety behavior.  
  Evidence status: confirmed.

- [S3] Path: `API.md`  
  Type: docs.  
  Detail: quick facts, endpoint index, endpoints, common agent workflows, operational notes.  
  Supports: local API behavior, endpoint coverage, auth headers, agent workflows.  
  Evidence status: confirmed.

- [S4] Path: `package.json`  
  Type: metadata.  
  Detail: name/version/license/description/scripts/dependencies/build targets.  
  Supports: package identity, scripts, stack dependencies, package targets.  
  Evidence status: confirmed.

- [S5] Path: `app/main/main.ts`  
  Type: source.  
  Detail: `BrowserWindow` options, `app.whenReady`, handler registration, API startup.  
  Supports: Electron hardening, main-process initialization, backup/API/IPC startup.  
  Evidence status: confirmed.

- [S6] Path: `app/main/db/index.ts`  
  Type: source.  
  Detail: `StrataDatabase`, SQLite path, pragmas, defaults, note/project/settings methods.  
  Supports: local SQLite model, WAL configuration, default settings.  
  Evidence status: confirmed.

- [S7] Path: `app/main/api/notesApiServer.ts`  
  Type: source.  
  Detail: schemas, token handling, request body limit, route handlers, related-note computation, `startNotesApiServer`.  
  Supports: HTTP API implementation and validation.  
  Evidence status: confirmed.

- [S8] Path: `app/preload/preload.ts`  
  Type: source.  
  Detail: `contextBridge.exposeInMainWorld('strata', api)`.  
  Supports: preload bridge exposure.  
  Evidence status: confirmed.

- [S9] Path: `app/cli/index.ts`  
  Type: source.  
  Detail: Commander setup, global flags, registered command modules.  
  Supports: CLI command surface and HTTP-only description.  
  Evidence status: confirmed.

- [S10] Path: `docs/CLI.md`, `docs/CLI_CHANGELOG.md`  
  Type: docs.  
  Detail: canonical root CLI docs pointer and changelog items.  
  Supports: CLI docs source-of-truth and completed CLI work claims in changelog.  
  Evidence status: confirmed for documented statements.

- [S11] Path: `docs/AI_PROVIDERS.md`  
  Type: docs.  
  Detail: providers, provider architecture, local llama.cpp future status, settings.  
  Supports: AI provider abstraction and planned local provider.  
  Evidence status: mixed confirmed/planned.

- [S12] Path: `docs/ai-edit-permissions.md`  
  Type: docs.  
  Detail: AI edit modes, history recording, read-only enforcement, revert behavior, deferred items.  
  Supports: AI edit safety/audit model and planned diff/confirm work.  
  Evidence status: mixed confirmed/planned.

- [S13] Path: `docs/publish-providers.md`  
  Type: docs.  
  Detail: publish provider interface, local HTML export, SSG hook, future provider ideas, shell security.  
  Supports: publish workflow and future publish ideas.  
  Evidence status: mixed confirmed/planned.

- [S14] Path: `docs/enterprise-readiness-checklist.md`  
  Type: docs.  
  Detail: checklist with checked/unchecked documentation, security, reliability, governance items.  
  Supports: enterprise gaps and completed documentation/security-control claims.  
  Evidence status: mixed confirmed/planned/unknown.

- [S15] Path: `app/preload/api.ts`  
  Type: source.  
  Detail: `StrataApi` interface.  
  Supports: typed preload API surface.  
  Evidence status: confirmed.

- [S16] Path: `app/main/db/migrations/index.ts`  
  Type: source.  
  Detail: migrations v1-v9.  
  Supports: schema evolution for notes/settings/AI/wiki links/edit history/route logs/projects/order.  
  Evidence status: confirmed.

- [S17] Path: `app/cli/lib/config.ts`, `app/cli/lib/apiClient.ts`, `app/cli/lib/errors.ts`, `app/cli/lib/validators.ts`  
  Type: source.  
  Detail: runtime options, HTTP client, error mapping, Zod validators.  
  Supports: CLI environment/config, HTTP client behavior, machine-safe errors.  
  Evidence status: confirmed.

- [S18] Path: `skills/strata-context/SKILL.md`  
  Type: skill.  
  Detail: read-side context search workflow.  
  Supports: Strata context skill behavior and trigger conditions.  
  Evidence status: confirmed for skill content.

- [S19] Path: `skills/strata-memory/SKILL.md`  
  Type: skill.  
  Detail: memory lifecycle, Agent Notes storage project, relationship to context/start skills.  
  Supports: durable memory workflow expectations.  
  Evidence status: confirmed for skill content.

- [S20] Path: `skills/strata-start/SKILL.md`  
  Type: skill.  
  Detail: inspected beginning duplicates Strata Context Skill content.  
  Supports: observed skill content and possible naming/content gap.  
  Evidence status: confirmed for inspected content.

- [S21] Path: `app/cli/commands/projects.ts`  
  Type: source.  
  Detail: project command registrations.  
  Supports: projects CLI operations.  
  Evidence status: confirmed.

- [S22] Path: `app/cli/commands/tags.ts`  
  Type: source.  
  Detail: tags list/suggest/normalize commands.  
  Supports: tag tooling.  
  Evidence status: confirmed.

- [S23] Path: `app/cli/lib/markdown.ts`, `app/renderer/src/tests/cli/markdown.test.ts`  
  Type: source/test.  
  Detail: tag normalization/suggestion and markdown helper tests.  
  Supports: deterministic tag utilities.  
  Evidence status: confirmed.

- [S24] Path: `app/renderer/src/domain/wikiLinks.ts`, `app/renderer/src/tests/wikiLinks.test.ts`  
  Type: source/test.  
  Detail: wiki link parsing and normalization behavior.  
  Supports: wiki link concept and test coverage.  
  Evidence status: confirmed.

- [S25] Path: `app/renderer/src/domain/relatedNotes.ts`, `app/renderer/src/tests/relatedNotes.test.ts`  
  Type: source/test.  
  Detail: related-note scoring and coverage.  
  Supports: related-note ranking behavior.  
  Evidence status: confirmed.

- [S26] Path: `app/main/ai/routing.ts`, `app/main/ai/aiRunner.ts`, `app/main/ai/tools.ts`, `app/main/ipc/aiHandlers.ts`  
  Type: source.  
  Detail: AI routing, runner, tools, IPC handlers.  
  Supports: AI workflow implementation.  
  Evidence status: confirmed.

- [S27] Path: `app/main/ai/evals/routing-examples.json`  
  Type: test fixture/eval data.  
  Detail: routing examples.  
  Supports: AI routing eval set existence.  
  Evidence status: confirmed.

- [S28] Path: `app/renderer/src/screens/App.tsx`, `app/renderer/src/components/*.tsx`, `app/renderer/src/state/useAppStore.ts`, `app/renderer/src/services/*.ts`  
  Type: source.  
  Detail: renderer screens/components/state/services.  
  Supports: React renderer organization.  
  Evidence status: confirmed.

- [S29] Path: `app/renderer/src/tests/filtering.test.ts`, `app/renderer/src/tests/markdownPaste.test.ts`, `app/renderer/src/tests/noteUtils.test.ts`, `app/renderer/src/tests/wikiLinks.test.ts`, `app/renderer/src/tests/relatedNotes.test.ts`  
  Type: tests.  
  Detail: renderer/domain unit tests.  
  Supports: tested behavior for filtering, paste conversion, note utilities, wiki links, related notes.  
  Evidence status: confirmed.

- [S30] Path: `app/shared/ipc.ts`, `app/shared/types.ts`, `app/shared/hotkeys.ts`, `app/shared/homeTiles.ts`, `app/shared/sidebarLayout.ts`  
  Type: source.  
  Detail: shared contracts and defaults.  
  Supports: cross-process types/contracts.  
  Evidence status: confirmed.

- [S31] Path: `integrations/publish/PublishProvider.ts`  
  Type: source.  
  Detail: `PublishProvider` interface.  
  Supports: publish provider architecture.  
  Evidence status: confirmed.

- [S32] Path: `integrations/publish/providers/LocalHtmlProvider.ts`, `integrations/publish/providers/DummyProvider.ts`  
  Type: source.  
  Detail: local HTML and dummy providers.  
  Supports: built-in publish providers.  
  Evidence status: confirmed.

- [S33] Path: `app/renderer/src/tests/cli/*.test.ts`  
  Type: tests.  
  Detail: CLI API client/config/validators/markdown/errors/agent mode/no-SQLite tests.  
  Supports: CLI behavior and architecture test coverage.  
  Evidence status: confirmed.

- [S34] Source: CLI output from `npm run strata -- --help` on 2026-07-04.  
  Type: CLI output.  
  Detail: command names and global options.  
  Supports: current generated CLI help surface.  
  Evidence status: confirmed.

- [S35] Source: command output from `npm run test -- --reporter=dot` on 2026-07-04.  
  Type: local validation output.  
  Detail: 12 test files and 51 tests passed.  
  Supports: local test status for this run.  
  Evidence status: confirmed.

- [S36] Source: absence from inspected sources.  
  Type: audit gap.  
  Detail: facts not found or not verified in local inspection.  
  Supports: unknown/gap statements.  
  Evidence status: unknown.

- [S37] Source: file inventory from `rg --files` in `/Users/robertdevore/2026/strata` on 2026-07-04.  
  Type: source inventory.  
  Detail: observed top-level/docs/scripts/app/skills/tests files.  
  Supports: repository map, examples gap, workflow-file gap.  
  Evidence status: confirmed for observed inventory.

- [S38] Path: `app/main/backup/backupManager.ts`, `scripts/backup-notes.sh`  
  Type: source/script.  
  Detail: backup manager and backup script.  
  Supports: backup workflow existence.  
  Evidence status: confirmed.

