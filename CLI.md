# Strata CLI

Strata CLI is a local-first, agent-safe command layer for Strata's HTTP API.

- Uses the Strata local API (`http://127.0.0.1:3939` by default)
- Never writes directly to SQLite
- Supports JSON output for scripts/agents
- Supports auth tokens, dry-run, confirmations, and deterministic exit codes
- Designed to evolve with Strata AI provider routing

## Run

```bash
npm run strata -- <command> [options]
```

Examples:

```bash
npm run strata -- health
npm run strata -- notes list --json
npm run strata -- notes create --content "# Test\n\nHello"
npm run strata -- ai route "Create a note about provider routing"
```

Legacy helper remains available:

```bash
npm run notes:api -- health
npm run strata:ai:legacy -- health
```

## Global Flags

Available for all commands:

- `--base-url <url>`
- `--token <token>`
- `--json`
- `--pretty`
- `--quiet`
- `--verbose`
- `--dry-run`
- `--confirm`
- `--timeout <ms>`
- `--agent`
- `--no-color`
- `--fail-on-warning`

## Environment Variables

- `STRATA_API_BASE_URL` default: `http://127.0.0.1:3939`
- `STRATA_API_TOKEN` optional
- `STRATA_CLI_OUTPUT` values: `pretty` or `json`
- `STRATA_CLI_DRY_RUN` values: `true` or `false`
- `STRATA_CLI_AGENT_MODE` values: `true` or `false`

Future provider variables can be used by future routing integrations (not required now):

- `STRATA_AI_CHEAP_PROVIDER`
- `STRATA_AI_CHEAP_MODEL`
- `STRATA_AI_PREMIUM_PROVIDER`
- `STRATA_AI_PREMIUM_MODEL`

## Exit Codes

- `0` success
- `1` generic failure
- `2` validation error / bad input
- `3` Strata API unavailable
- `4` authentication failure
- `5` not found
- `6` conflict / unsafe operation refused
- `7` AI/provider failure
- `8` timeout
- `9` partial failure

## Command Surface

### Health

```bash
npm run strata -- health
```

### Config

```bash
npm run strata -- config show
npm run strata -- config doctor
```

### Notes

```bash
npm run strata -- notes list --query "routing" --tag ai --limit 20
npm run strata -- notes get <noteId>
npm run strata -- notes create --content "# Title\n\nBody" --tag ai --tag routing
npm run strata -- notes update <noteId> --append "More text" --confirm
npm run strata -- notes delete <noteId> --confirm
npm run strata -- notes archive <noteId> --confirm
npm run strata -- notes unarchive <noteId> --confirm
npm run strata -- notes star <noteId>
npm run strata -- notes unstar <noteId>
```

Safety:

- `update`, `archive`, `unarchive`, `delete`, and `delete-many` require `--confirm` unless `--dry-run`
- `delete-many` also requires `--confirm-bulk-delete`
- In `--agent` mode, destructive operations require `--allow-destructive`

### Search

```bash
npm run strata -- search "provider routing" --json
```

### Tags

```bash
npm run strata -- tags list
npm run strata -- tags suggest --file ./note.md
npm run strata -- tags normalize "AI Routing, provider abstraction, ai-routing"
```

### Tasks

```bash
npm run strata -- tasks extract --stdin --json
```

Uses deterministic extraction now and is ready for provider-backed extraction later.

### AI

```bash
npm run strata -- ai route "Create a note about DeepSeek Flash"
npm run strata -- ai note "Found that aiHandlers.ts needs provider abstraction"
npm run strata -- ai bench
npm run strata -- ai eval-routing
```

### Agent

```bash
npm run strata -- agent capture "..."
npm run strata -- agent decision "..."
npm run strata -- agent todo "..."
npm run strata -- agent summary --file ./summary.md
npm run strata -- agent context search "routing"
```

Agent-mode behaviors:

- JSON-first output
- Non-interactive safe behavior
- No destructive defaults
- Stable machine-readable error payloads

## JSON Error Shape

In JSON mode, CLI errors are machine-safe:

```json
{
  "ok": false,
  "error": {
    "code": "STRATA_API_UNAVAILABLE",
    "message": "Could not reach Strata API at http://127.0.0.1:3939",
    "hint": "Start Strata, then try again."
  }
}
```

## Security Model

- No token values are printed
- No direct DB access from CLI
- No shell execution from model output
- API base URL should remain localhost for local-first safety
