# Strata CLI

[![Release](https://img.shields.io/github/v/release/robertdevore/strata?label=release&color=2f6feb)](https://github.com/robertdevore/strata/releases)
[![Local API](https://img.shields.io/badge/api-localhost:3939-0366d6)](API.md)
[![Docs](https://img.shields.io/badge/docs-README%20%7C%20API-0b7285)](README.md)

Strata CLI is the automation-first interface for Strata.

It talks to the local HTTP API, never writes directly to SQLite, and is designed for both human and agent workflows.

## Quick Start

```bash
npm run strata -- health
npm run strata -- notes list --json
npm run strata -- notes create --content "# Test\n\nHello"
npm run strata -- ai route "Create a note about provider routing"
```

Command format:

```bash
npm run strata -- <command> [options]
```

Legacy helpers are still available:

```bash
npm run notes:api -- health
npm run strata:ai:legacy -- health
```

## Global Flags

Available on all commands.

| Flag | Description |
|------|-------------|
| `--base-url <url>` | Override API base URL |
| `--token <token>` | Send auth token |
| `--json` | Machine-readable output |
| `--pretty` | Human-readable output |
| `--quiet` | Minimal output |
| `--verbose` | Extra diagnostics |
| `--dry-run` | Show intent without executing |
| `--confirm` | Explicitly allow write/destructive actions |
| `--timeout <ms>` | Request timeout in milliseconds |
| `--agent` | Agent-safe behavior defaults |
| `--no-color` | Disable color output |
| `--fail-on-warning` | Exit non-zero on warnings |

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `STRATA_API_BASE_URL` | `http://127.0.0.1:3939` | Local API endpoint |
| `STRATA_API_TOKEN` | unset | Optional auth token |
| `STRATA_CLI_OUTPUT` | `pretty` | `pretty` or `json` |
| `STRATA_CLI_DRY_RUN` | `false` | `true` or `false` |
| `STRATA_CLI_AGENT_MODE` | `false` | `true` or `false` |

Forward-looking provider variables (optional today):

- `STRATA_AI_CHEAP_PROVIDER`
- `STRATA_AI_CHEAP_MODEL`
- `STRATA_AI_PREMIUM_PROVIDER`
- `STRATA_AI_PREMIUM_MODEL`

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Generic failure |
| `2` | Validation error / bad input |
| `3` | Strata API unavailable |
| `4` | Authentication failure |
| `5` | Not found |
| `6` | Conflict / unsafe operation refused |
| `7` | AI/provider failure |
| `8` | Timeout |
| `9` | Partial failure |

## Command Reference

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

Safety behavior:

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

Task extraction is deterministic today and ready for provider-backed routing later.

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

Agent-mode defaults:

- JSON-first output
- Non-interactive safe behavior
- No destructive defaults
- Stable machine-readable error payloads

## JSON Error Shape

In JSON mode, CLI failures return machine-safe payloads:

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

- No token values are printed.
- No direct DB access from CLI.
- No shell execution from model output.
- Localhost API defaults support local-first safety.

## Related Docs

- [README.md](README.md)
- [API.md](API.md)
- [SECURITY.md](SECURITY.md)
