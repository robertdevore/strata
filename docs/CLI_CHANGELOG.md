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
