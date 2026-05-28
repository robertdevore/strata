# CLI Changelog

## 2026-05-27

### Item 1: Core CLI runtime and command surface
Status: completed

Summary:
- Added the TypeScript CLI entrypoint and command namespaces for health, config, notes, search, tags, tasks, AI, and agent workflows.
- Added HTTP-only API client wiring with typed validation, retry behavior for safe reads, deterministic error mapping, and machine-safe output handling.
- Added safety guardrails for confirmation and agent-mode destructive controls.
- Added script launcher at scripts/strata-cli.ts and included CLI source paths in lint/typecheck config.

Validation:
- npm run strata -- --help
- npm run strata -- config show --json
- npm run strata -- ai route "Create a note about routing fallback" --json
- npm run strata -- tags normalize "AI Routing, provider abstraction, ai-routing" --json
- npm run strata -- tasks extract --stdin --json
- npm run strata -- health --json
- npm run strata -- config doctor --json

### Item 2: CLI contract, safety, and architecture tests
Status: completed

Summary:
- Added focused CLI unit coverage for config resolution, API client behavior, safety gates, markdown helpers, schema validation, and structured error payloads.
- Added architecture guard test to ensure CLI client remains HTTP-only and does not import SQLite/database modules.

Validation:
- vitest run app/renderer/src/tests/cli/config.test.ts
- vitest run app/renderer/src/tests/cli/apiClient.test.ts
- vitest run app/renderer/src/tests/cli/agentMode.test.ts
- vitest run app/renderer/src/tests/cli/markdown.test.ts
- vitest run app/renderer/src/tests/cli/validators.test.ts
- vitest run app/renderer/src/tests/cli/errors.test.ts
- vitest run app/renderer/src/tests/cli/noSqliteAccess.test.ts

### Item 3: CLI documentation and command discoverability
Status: completed

Summary:
- Added canonical root CLI guide with command surface, safety model, environment variables, and exit code contract.
- Updated README and API docs to reference the enterprise CLI entrypoints and command examples.
- Simplified docs/CLI.md to point to the canonical root CLI.md source of truth.

Validation:
- npm run strata -- --help
- npm run strata -- notes list --json
- npm run strata -- ai route "Create a note about provider routing"
